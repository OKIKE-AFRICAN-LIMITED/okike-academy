"""Resilient JSON LLM caller for Okike Academy Pipeline Stages 1-3.

Resilience chain:
  1. Gemini 2.5 Flash (with retry/backoff on transient 429/500/503 spikes)
  2. Gemini 2.5 Flash-Lite fallback (same GEMINI_API_KEY, rarely hits 503)
  3. OpenRouter fallback (OPENROUTER_API_KEY, defaults to `openrouter/free`)
"""

from __future__ import annotations

import json
import os
import re
import time
from typing import Any

import requests


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


def _call_gemini_model(
    api_key: str,
    model: str,
    prompt: str,
    temperature: float,
    max_retries: int = 3,
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
                wait_s = 3 * attempt
                print(f"[LLM] {model} returned {resp.status_code}, retrying in {wait_s}s...")
                time.sleep(wait_s)
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
    max_retries: int = 2,
) -> dict[str, Any]:
    model = os.environ.get("OPENROUTER_MODEL", "openrouter/free").strip() or "openrouter/free"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://academy.okikeenterprises.com",
        "X-Title": "Okike Academy Video Pipeline",
    }
    payload = {
        "model": model,
        "temperature": temperature,
        "messages": [
            {
                "role": "system",
                "content": "You are a strict JSON generator. Return ONLY a single valid JSON object with no markdown fences or extra commentary.",
            },
            {"role": "user", "content": prompt},
        ],
    }
    last_err = ""
    for attempt in range(1, max_retries + 1):
        try:
            resp = requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers,
                json=payload,
                timeout=120,
            )
            if resp.ok:
                data = resp.json()
                text = (
                    data.get("choices", [{}])[0]
                    .get("message", {})
                    .get("content", "")
                )
                if not text:
                    raise RuntimeError("OpenRouter returned empty content.")
                return _extract_json(text)

            last_err = f"OpenRouter API error ({resp.status_code}): {resp.text[:300]}"
            if resp.status_code in (429, 500, 502, 503, 504) and attempt < max_retries:
                time.sleep(3 * attempt)
                continue
            raise RuntimeError(last_err)
        except (requests.RequestException, json.JSONDecodeError) as exc:
            last_err = f"OpenRouter error: {exc}"
            if attempt < max_retries:
                time.sleep(2 * attempt)
                continue
            raise RuntimeError(last_err) from exc
    raise RuntimeError(last_err)


def call_gemini_json(prompt: str, temperature: float = 0.4) -> dict[str, Any]:
    gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
    openrouter_key = os.environ.get("OPENROUTER_API_KEY", "").strip()

    if not gemini_key and not openrouter_key:
        raise RuntimeError(
            "Either GEMINI_API_KEY or OPENROUTER_API_KEY is required for Stages 1-3."
        )

    errors: list[str] = []

    if gemini_key:
        for model in ("gemini-2.5-flash", "gemini-2.5-flash-lite"):
            try:
                return _call_gemini_model(gemini_key, model, prompt, temperature)
            except Exception as exc:
                print(f"[LLM] {model} failed: {exc}")
                errors.append(str(exc))

    if openrouter_key:
        print("[LLM] Falling back to OpenRouter...")
        try:
            return _call_openrouter_json(openrouter_key, prompt, temperature)
        except Exception as exc:
            print(f"[LLM] OpenRouter failed: {exc}")
            errors.append(str(exc))

    raise RuntimeError(" | ".join(errors))
