"""Resilient JSON LLM caller for Okike Academy Pipeline Stages 1-3.

Providers (selected via OKIKE_LLM_PROVIDER):
  - "hf" / "local" (RECOMMENDED on Colab GPU — ZERO 503s, ZERO 429s, ZERO quotas!):
      Runs Qwen/Qwen2.5-14B-Instruct on >=40GB GPUs (A100/G4) or
      Qwen/Qwen2.5-7B-Instruct on smaller GPUs (L4/T4), then unloads VRAM before Stage 4.
  - "auto" (default): uses local HF Qwen if OKIKE_LLM_PROVIDER=hf or if GPU >= 15GB and no GEMINI_API_KEY,
      otherwise Gemini -> OpenRouter -> local HF Qwen fallback.
"""

from __future__ import annotations

import gc
import json
import os
import re
import time
from typing import Any

import requests

_HF_MODEL: Any = None
_HF_TOKENIZER: Any = None
_HF_MODEL_ID: str = ""


def _extract_json(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end > start:
            return json.loads(cleaned[start : end + 1])
        raise


def unload_local_llm() -> None:
    """Frees GPU VRAM after Stage 3 so Stage 4 (FLUX + Wan2.2) has full headroom."""
    global _HF_MODEL, _HF_TOKENIZER, _HF_MODEL_ID
    if _HF_MODEL is None:
        return
    try:
        import torch

        del _HF_MODEL
        del _HF_TOKENIZER
        _HF_MODEL = None
        _HF_TOKENIZER = None
        _HF_MODEL_ID = ""
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        print("[LLM] Unloaded local HuggingFace LLM from GPU VRAM.")
    except Exception:
        _HF_MODEL = None
        _HF_TOKENIZER = None


def _call_hf_local_json(prompt: str, temperature: float = 0.35) -> dict[str, Any]:
    """Runs Qwen2.5-14B-Instruct (A100/G4) or Qwen2.5-7B-Instruct (L4/T4) locally on GPU."""
    global _HF_MODEL, _HF_TOKENIZER, _HF_MODEL_ID
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    if not torch.cuda.is_available():
        raise RuntimeError("Local HuggingFace LLM requires a CUDA GPU.")

    vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024**3)
    default_repo = (
        "Qwen/Qwen2.5-14B-Instruct" if vram_gb >= 38.0 else "Qwen/Qwen2.5-7B-Instruct"
    )
    model_id = os.environ.get("OKIKE_HF_LLM", default_repo).strip() or default_repo
    hf_token = os.environ.get("HF_TOKEN", "").strip() or None

    if _HF_MODEL is None or _HF_MODEL_ID != model_id:
        unload_local_llm()
        print(f"[LLM] Loading local HuggingFace model {model_id} on {vram_gb:.0f}GB GPU...")
        _HF_TOKENIZER = AutoTokenizer.from_pretrained(model_id, token=hf_token)
        _HF_MODEL = AutoModelForCausalLM.from_pretrained(
            model_id,
            torch_dtype=torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16,
            device_map="auto",
            token=hf_token,
        )
        _HF_MODEL_ID = model_id

    messages = [
        {
            "role": "system",
            "content": (
                "You are an institutional curriculum designer and video director. "
                "Return ONLY a single valid JSON object. No markdown fences, no commentary."
            ),
        },
        {"role": "user", "content": prompt},
    ]
    text_in = _HF_TOKENIZER.apply_chat_template(
        messages, tokenize=False, add_generation_prompt=True
    )
    inputs = _HF_TOKENIZER([text_in], return_tensors="pt").to(_HF_MODEL.device)

    do_sample = temperature > 0.05
    with torch.no_grad():
        out_ids = _HF_MODEL.generate(
            **inputs,
            max_new_tokens=3072,
            do_sample=do_sample,
            temperature=max(0.1, temperature) if do_sample else None,
            top_p=0.9 if do_sample else None,
            pad_token_id=_HF_TOKENIZER.eos_token_id,
        )
    gen_ids = out_ids[0][inputs["input_ids"].shape[1] :]
    raw_text = _HF_TOKENIZER.decode(gen_ids, skip_special_tokens=True)
    return _extract_json(raw_text)


def _call_gemini_model(
    api_key: str,
    model: str,
    prompt: str,
    temperature: float,
    max_retries: int = 2,
) -> dict[str, Any]:
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={api_key}"
    )
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": temperature,
        },
    }
    last_err = ""
    for attempt in range(1, max_retries + 1):
        try:
            resp = requests.post(url, json=payload, timeout=90)
            if resp.ok:
                data = resp.json()
                text = (
                    data.get("candidates", [{}])[0]
                    .get("content", {})
                    .get("parts", [{}])[0]
                    .get("text", "")
                )
                if not text:
                    raise RuntimeError(f"Gemini ({model}) returned empty JSON.")
                return _extract_json(text)

            last_err = f"Gemini API error ({resp.status_code}) on {model}: {resp.text[:300]}"
            if resp.status_code in (429, 500, 502, 503, 504) and attempt < max_retries:
                time.sleep(3 * attempt)
                continue
            raise RuntimeError(last_err)
        except requests.RequestException as exc:
            last_err = f"Gemini network error on {model}: {exc}"
            if attempt < max_retries:
                time.sleep(3 * attempt)
                continue
            raise RuntimeError(last_err) from exc
    raise RuntimeError(last_err)


def _call_openrouter_json(
    api_key: str,
    prompt: str,
    temperature: float,
    max_retries: int = 3,
) -> dict[str, Any]:
    env_model = os.environ.get("OPENROUTER_MODEL", "").strip()
    models_to_try = [env_model] if env_model else [
        "openrouter/free",
        "meta-llama/llama-3.3-70b-instruct:free",
        "openrouter/free",
    ]
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://academy.okikeenterprises.com",
        "X-Title": "Okike Academy Video Pipeline",
    }
    last_err = ""
    for attempt in range(1, max_retries + 1):
        model = models_to_try[(attempt - 1) % len(models_to_try)]
        payload = {
            "model": model,
            "temperature": temperature,
            "max_tokens": 4096,
            "messages": [
                {
                    "role": "system",
                    "content": "You are a strict JSON generator. Return ONLY a single valid JSON object with no markdown fences or extra commentary.",
                },
                {"role": "user", "content": prompt},
            ],
        }
        try:
            resp = requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers,
                json=payload,
                timeout=120,
            )
            if resp.ok:
                data = resp.json()
                msg = data.get("choices", [{}])[0].get("message", {}) or {}
                text = (msg.get("content") or "").strip()
                if not text:
                    last_err = f"OpenRouter ({model}) returned empty content."
                    if attempt < max_retries:
                        time.sleep(2 * attempt)
                        continue
                    raise RuntimeError(last_err)
                return _extract_json(text)

            last_err = f"OpenRouter API error ({resp.status_code}) on {model}: {resp.text[:300]}"
            if attempt < max_retries:
                time.sleep(3 * attempt)
                continue
            raise RuntimeError(last_err)
        except (requests.RequestException, json.JSONDecodeError, RuntimeError) as exc:
            last_err = f"OpenRouter error ({model}): {exc}"
            if attempt < max_retries:
                time.sleep(2 * attempt)
                continue
            raise RuntimeError(last_err) from exc
    raise RuntimeError(last_err)


def call_gemini_json(prompt: str, temperature: float = 0.4) -> dict[str, Any]:
    provider = os.environ.get("OKIKE_LLM_PROVIDER", "hf").strip().lower()
    gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
    openrouter_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    errors: list[str] = []

    # 1. Local HuggingFace Qwen2.5-14B / 7B Instruct (default on GPU: zero 503/429!)
    if provider in ("hf", "local", "qwen"):
        try:
            return _call_hf_local_json(prompt, temperature)
        except Exception as exc:
            print(f"[LLM] Local HuggingFace LLM failed: {exc}")
            errors.append(str(exc))

    # 2. Optional cloud fallbacks if local GPU LLM wasn't used
    if openrouter_key:
        try:
            return _call_openrouter_json(openrouter_key, prompt, temperature)
        except Exception as exc:
            print(f"[LLM] OpenRouter failed: {exc}")
            errors.append(str(exc))

    if gemini_key and provider != "hf":
        for model in ("gemini-2.5-flash", "gemini-2.5-flash-lite"):
            try:
                return _call_gemini_model(gemini_key, model, prompt, temperature)
            except Exception as exc:
                print(f"[LLM] {model} failed: {exc}")
                errors.append(str(exc))

    raise RuntimeError(" | ".join(errors) or "No LLM provider available.")
