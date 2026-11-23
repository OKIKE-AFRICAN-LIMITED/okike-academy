"""
Stage 4: Asset Generator & License Logger (Okike Academy)
=========================================================
Generates crisp, content-appropriate visual assets by type:
  - UI screens & mockups (Good vs Bad from one HTML/CSS template via Playwright/Chromium)
  - Live code output previews (HTML/CSS rendered via Playwright/Chromium)
  - Bespoke editorial illustrations via HuggingFace FLUX.1-schnell (with SDXL-Turbo fallback)
    for analogy_illustration and real_world_scenario scenes (e.g. a server under attack)
  - Content-hash caching so unchanged scenes are never re-rendered
  - Outputs mandatory `licenses.json` with alt_text, source, license, author, date, prompt
"""

from __future__ import annotations

import datetime
import gc
import json
import os
from pathlib import Path
from typing import Any

from .schemas import AssetRecord, content_hash, to_dict

OKIKE_STYLE_PREFIX = (
    "Cinematic documentary film still, shot on ARRI Alexa 35mm lens, shallow depth of field, "
    "natural realistic studio and architectural lighting, crisp photorealistic details, "
    "BBC and Netflix MasterClass production quality, authentic diverse people and real-world environments, "
    "strictly NO text, NO letters, NO numbers, NO subtitles, NO watermarks: "
)

_IMAGE_PIPE: Any = None
_IMAGE_MODEL_USED: str = ""
_VIDEO_PIPE: Any = None


def _unload_video_pipeline() -> None:
    """Frees GPU VRAM after Wan2.2 finishes so LatentSync has full headroom."""
    global _VIDEO_PIPE
    if _VIDEO_PIPE is None:
        return
    try:
        import torch

        del _VIDEO_PIPE
        _VIDEO_PIPE = None
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        _VIDEO_PIPE = None


def _animate_illustration_with_wan(
    image_png: Path,
    subject_prompt: str,
    out_mp4: Path,
) -> bool:
    """
    Animates a crisp FLUX film still into a smooth looping MP4 via Wan2.2:
      - >= 40 GB VRAM (G4 96GB / A100 80GB): Wan-AI/Wan2.2-I2V-A14B-Diffusers (27B MoE flagship, 720p!)
      - 18-39 GB VRAM (L4 22.5GB):           Wan-AI/Wan2.2-TI2V-5B-Diffusers (5B, 480p)
    """
    global _VIDEO_PIPE
    enabled = os.environ.get("OKIKE_ANIMATE_ILLUSTRATIONS", "1").strip().lower()
    if enabled in ("0", "false", "off", "none"):
        return False

    try:
        import torch

        if not torch.cuda.is_available():
            return False
        vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024**3)
        if vram_gb < 18.0:
            print(f"[Stage 4 Assets] GPU has {vram_gb:.1f} GB VRAM (<18 GB); keeping crisp Ken Burns PNG.")
            return False

        from diffusers import AutoencoderKLWan, WanImageToVideoPipeline
        from diffusers.utils import export_to_video, load_image

        hf_token = os.environ.get("HF_TOKEN", "").strip() or None
        is_monster_gpu = vram_gb >= 40.0
        default_model = (
            "Wan-AI/Wan2.2-I2V-A14B-Diffusers"
            if is_monster_gpu
            else "Wan-AI/Wan2.2-TI2V-5B-Diffusers"
        )
        model_id = os.environ.get("OKIKE_VIDEO_MODEL", default_model).strip() or default_model
        is_a14b = "a14b" in model_id.lower()

        if _VIDEO_PIPE is None:
            print(f"[Stage 4 Assets] Loading {model_id} on {vram_gb:.0f}GB GPU (bfloat16)...")
            vae = AutoencoderKLWan.from_pretrained(
                model_id, subfolder="vae", torch_dtype=torch.float32, token=hf_token
            )
            pipe = WanImageToVideoPipeline.from_pretrained(
                model_id, vae=vae, torch_dtype=torch.bfloat16, token=hf_token
            )
            if vram_gb >= 75.0:
                pipe.to("cuda")
            else:
                pipe.enable_model_cpu_offload()
            _VIDEO_PIPE = pipe

        vid_w, vid_h = (1280, 720) if is_a14b else (832, 480)
        steps = 36 if is_a14b else 24
        num_frames = 81 if is_a14b else 65
        fps = 16 if is_a14b else 24

        img = load_image(str(image_png)).resize((vid_w, vid_h))
        motion_prompt = (
            f"Smooth cinematic documentary camera motion, natural realistic human and environmental movement, "
            f"steady 35mm cinema lens, crisp focus, high production value, no text, no distortion: "
            f"{subject_prompt.strip()}"
        )
        kwargs: dict[str, Any] = {
            "image": img,
            "prompt": motion_prompt,
            "negative_prompt": "blurry, distorted faces, extra fingers, morphing text, flicker, cartoon, watermark, low quality",
            "height": vid_h,
            "width": vid_w,
            "num_frames": num_frames,
            "num_inference_steps": steps,
            "guidance_scale": 3.5 if is_a14b else 5.0,
        }
        if is_a14b:
            kwargs["guidance_scale_2"] = 3.5

        out = _VIDEO_PIPE(**kwargs)
        frames = out.frames[0]
        raw_mp4 = out_mp4.with_name(out_mp4.stem + "_raw.mp4")
        pp_mp4 = out_mp4.with_name(out_mp4.stem + "_pp.mp4")
        export_to_video(frames, str(raw_mp4), fps=fps)
        # Create a seamless ping-pong loop (~24s) with zero RAM bloat (-stream_loop copies packets in 0.05s)
        import subprocess
        pp_cmd = [
            "ffmpeg", "-y", "-i", str(raw_mp4),
            "-filter_complex",
            "[0:v]split[f][b];[b]reverse[r];[f][r]concat=n=2:v=1:a=0[out]",
            "-map", "[out]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "fast",
            str(pp_mp4),
        ]
        r1 = subprocess.run(pp_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if r1.returncode == 0 and pp_mp4.exists():
            loop_cmd = [
                "ffmpeg", "-y", "-stream_loop", "5", "-i", str(pp_mp4),
                "-t", "24", "-c", "copy", str(out_mp4),
            ]
            r2 = subprocess.run(loop_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if r2.returncode != 0 or not out_mp4.exists():
                pp_mp4.replace(out_mp4)
            else:
                pp_mp4.unlink(missing_ok=True)
            raw_mp4.unlink(missing_ok=True)
        else:
            raw_mp4.replace(out_mp4)
        print(f"[Stage 4 Assets] Animated illustration ({model_id}, {vid_w}x{vid_h}): {out_mp4.name}")
        return out_mp4.exists()
    except Exception as exc:
        print(f"[Stage 4 Assets] Wan2.2 animation skipped ({exc}); using crisp PNG fallback.")
        return False


def _load_image_pipeline() -> tuple[Any, str]:
    """Lazily loads FLUX.1-dev / FLUX.1-schnell (explicit HF_TOKEN) or SDXL-Turbo fallback."""
    global _IMAGE_PIPE, _IMAGE_MODEL_USED
    if _IMAGE_PIPE is not None:
        return _IMAGE_PIPE, _IMAGE_MODEL_USED

    choice = os.environ.get("OKIKE_IMAGE_MODEL", "flux-schnell").strip().lower()
    if choice in ("off", "none", "false", "0"):
        return None, ""

    import torch

    if not torch.cuda.is_available():
        print("[Stage 4 Assets] No CUDA GPU detected; skipping diffusion illustration generation.")
        return None, ""

    hf_token = os.environ.get("HF_TOKEN", "").strip() or None
    vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024**3)

    flux_candidates: list[str] = []
    if choice in ("flux-dev", "black-forest-labs/flux.1-dev"):
        flux_candidates = ["black-forest-labs/FLUX.1-dev", "black-forest-labs/FLUX.1-schnell"]
    elif choice in ("flux", "flux-schnell", "black-forest-labs/flux.1-schnell"):
        flux_candidates = ["black-forest-labs/FLUX.1-schnell"]

    for repo_id in flux_candidates:
        try:
            from diffusers import FluxPipeline

            print(f"[Stage 4 Assets] Loading {repo_id} on {vram_gb:.0f}GB GPU (bfloat16)...")
            pipe = FluxPipeline.from_pretrained(
                repo_id,
                torch_dtype=torch.bfloat16,
                token=hf_token,
            )
            if vram_gb >= 40.0:
                pipe.to("cuda")
            else:
                pipe.enable_model_cpu_offload()
            _IMAGE_PIPE = pipe
            _IMAGE_MODEL_USED = repo_id
            return _IMAGE_PIPE, _IMAGE_MODEL_USED
        except Exception as exc:
            print(f"[Stage 4 Assets] {repo_id} load failed ({exc}); trying next model...")

    try:
        from diffusers import AutoPipelineForText2Image

        print("[Stage 4 Assets] Loading stabilityai/sdxl-turbo (fp16)...")
        pipe = AutoPipelineForText2Image.from_pretrained(
            "stabilityai/sdxl-turbo",
            torch_dtype=torch.float16,
            variant="fp16",
        ).to("cuda")
        _IMAGE_PIPE = pipe
        _IMAGE_MODEL_USED = "stabilityai/sdxl-turbo"
        return _IMAGE_PIPE, _IMAGE_MODEL_USED
    except Exception as exc:
        print(f"[Stage 4 Assets] SDXL-Turbo load failed ({exc}); skipping AI illustrations.")
        return None, ""


def _unload_image_pipeline() -> None:
    """Frees GPU VRAM after Stage 4 so Stage 6 LatentSync has full headroom."""
    global _IMAGE_PIPE, _IMAGE_MODEL_USED
    if _IMAGE_PIPE is None:
        return
    try:
        import torch

        del _IMAGE_PIPE
        _IMAGE_PIPE = None
        _IMAGE_MODEL_USED = ""
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        _IMAGE_PIPE = None


def _generate_editorial_illustration(
    subject_prompt: str,
    out_png: Path,
    seed: int = 42,
) -> tuple[bool, str, str]:
    """Generates a 1024x576 (16:9) editorial illustration using FLUX.1-schnell or SDXL-Turbo."""
    full_prompt = OKIKE_STYLE_PREFIX + subject_prompt.strip()
    pipe, model_name = _load_image_pipeline()
    if pipe is None:
        return False, "", full_prompt

    try:
        import torch

        out_png.parent.mkdir(parents=True, exist_ok=True)
        gen = torch.Generator(device="cpu").manual_seed(seed)

        if "FLUX" in model_name.upper():
            is_dev = "DEV" in model_name.upper()
            result = pipe(
                prompt=full_prompt,
                width=1280,
                height=720,
                num_inference_steps=24 if is_dev else 4,
                guidance_scale=3.5 if is_dev else 0.0,
                max_sequence_length=256,
                generator=gen,
            )
        else:
            result = pipe(
                prompt=full_prompt,
                width=1024,
                height=576,
                num_inference_steps=4,
                guidance_scale=0.0,
                generator=gen,
            )
        result.images[0].save(str(out_png), format="PNG")
        print(f"[Stage 4 Assets] Generated illustration ({model_name}): {out_png.name}")
        return True, model_name, full_prompt
    except Exception as exc:
        print(f"[Stage 4 Assets] Illustration generation failed ({exc})")
        return False, model_name, full_prompt


def _build_ui_mockup_html(
    ui_template: str, variant: str, spec: dict[str, Any]
) -> str:
    """Renders real, crisp Good vs Bad UI screens from one shared template."""
    is_bad = variant == "bad"
    title = spec.get("ui_title") or "Okike Workspace"
    cta = spec.get("ui_cta") or "Get Started"
    sub = spec.get("ui_subtitle") or "Organize team projects with clarity and speed."

    if ui_template == "signup_form":
        if is_bad:
            return f"""<!doctype html><html><body style="margin:0;background:#d1d5db;font-family:Comic Sans MS,serif;padding:18px;">
            <div style="background:#fff;border:3px dashed #ef4444;padding:10px;width:540px;margin:0 auto;">
              <div style="font-size:13px;color:#9ca3af;margin-bottom:4px;">REGISTER NOW FORM 12B</div>
              <input placeholder="First Name" style="width:100%;margin:2px 0;padding:3px;font-size:11px;"/>
              <input placeholder="Middle Name" style="width:100%;margin:2px 0;padding:3px;font-size:11px;"/>
              <input placeholder="Email" style="width:100%;margin:2px 0;padding:3px;font-size:11px;"/>
              <input placeholder="Confirm Email" style="width:100%;margin:2px 0;padding:3px;font-size:11px;"/>
              <input placeholder="Password" style="width:100%;margin:2px 0;padding:3px;font-size:11px;"/>
              <input placeholder="Phone" style="width:100%;margin:2px 0;padding:3px;font-size:11px;"/>
              <div style="display:flex;gap:4px;margin-top:6px;">
                <button style="background:#eab308;color:#fef08a;border:none;padding:4px 8px;font-size:11px;">Cancel</button>
                <button style="background:#9ca3af;color:#d1d5db;border:none;padding:4px 8px;font-size:11px;">Submit</button>
                <button style="background:#ef4444;color:#fff;border:none;padding:4px 8px;font-size:11px;">Reset All</button>
              </div>
            </div></body></html>"""
        return f"""<!doctype html><html><body style="margin:0;background:#f7f7f2;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;">
        <div style="background:#fff;border:1px solid #d9d9d4;padding:36px;width:440px;box-shadow:0 16px 40px rgba(0,0,0,0.06);">
          <div style="font-size:12px;font-family:monospace;color:#595954;letter-spacing:0.12em;margin-bottom:8px;">CREATE ACCOUNT</div>
          <h2 style="margin:0 0 6px;font-size:26px;color:#0e0e0e;">{title}</h2>
          <p style="margin:0 0 24px;font-size:14px;color:#595954;">{sub}</p>
          <label style="display:block;font-size:13px;font-weight:600;color:#0e0e0e;margin-bottom:6px;">Work Email</label>
          <input value="amara@okike.co" style="width:100%;box-sizing:border-box;padding:12px 14px;border:1px solid #0e0e0e;font-size:15px;margin-bottom:16px;"/>
          <label style="display:block;font-size:13px;font-weight:600;color:#0e0e0e;margin-bottom:6px;">Password</label>
          <input type="password" value="••••••••••" style="width:100%;box-sizing:border-box;padding:12px 14px;border:1px solid #d9d9d4;font-size:15px;margin-bottom:22px;"/>
          <button style="width:100%;background:#e3ee32;color:#0e0e0e;border:1px solid #0e0e0e;padding:14px;font-size:15px;font-weight:700;">{cta} →</button>
        </div></body></html>"""

    if ui_template == "dashboard_card":
        if is_bad:
            return f"""<!doctype html><html><body style="margin:0;background:#e5e7eb;font-family:Times New Roman,serif;padding:12px;color:#6b7280;">
            <div style="background:#f9fafb;border:2px solid #9ca3af;padding:8px;">
              <div style="font-size:12px;">DASHBOARD | USERS | BILLING | LOGS | EXPORT | ADMIN | SETTINGS | HELP</div>
              <div style="display:flex;gap:4px;margin-top:8px;">
                <div style="background:#fef08a;padding:6px;font-size:11px;flex:1;">Revenue: 48200 USD (+2%) click here</div>
                <div style="background:#fbcfe8;padding:6px;font-size:11px;flex:1;">Active: 1204 users today maybe</div>
                <div style="background:#bfdbfe;padding:6px;font-size:11px;flex:1;">Errors: 14 warnings pending review</div>
              </div>
              <p style="font-size:12px;margin:8px 0;">{title} — {sub} Notice all metrics share equal visual weight with clashing colors and cramped borders.</p>
            </div></body></html>"""
        return f"""<!doctype html><html><body style="margin:0;background:#f7f7f2;font-family:system-ui,-apple-system,sans-serif;color:#0e0e0e;padding:32px;">
        <div style="background:#fff;border:1px solid #d9d9d4;padding:28px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
            <div>
              <div style="font-family:monospace;font-size:11px;color:#595954;letter-spacing:0.14em;">OVERVIEW</div>
              <h2 style="margin:4px 0 0;font-size:24px;letter-spacing:-0.02em;">{title}</h2>
            </div>
            <button style="background:#e3ee32;color:#0e0e0e;border:1px solid #0e0e0e;padding:10px 18px;font-size:13px;font-weight:700;">{cta}</button>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;">
            <div style="border:1px solid #d9d9d4;padding:18px;background:#f7f7f2;">
              <div style="font-size:12px;color:#595954;margin-bottom:6px;">Active Learners</div>
              <div style="font-size:32px;font-weight:800;">1,204</div>
            </div>
            <div style="border:1px solid #d9d9d4;padding:18px;background:#f7f7f2;">
              <div style="font-size:12px;color:#595954;margin-bottom:6px;">Completion Rate</div>
              <div style="font-size:32px;font-weight:800;">89%</div>
            </div>
            <div style="border:1px solid #0e0e0e;padding:18px;background:#0e0e0e;color:#fff;">
              <div style="font-size:12px;color:#a8a8a0;margin-bottom:6px;">System Health</div>
              <div style="font-size:32px;font-weight:800;color:#e3ee32;">99.9%</div>
            </div>
          </div>
        </div></body></html>"""

    # Default: landing_hero / hierarchy & contrast comparison
    if is_bad:
        return f"""<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:Times New Roman,serif;padding:18px;color:#6b7280;">
        <div style="background:#e5e7eb;padding:16px;border:1px solid #d1d5db;">
          <div style="font-size:14px;">Home | About | Pricing | Blog | Careers | FAQ | Legal | Press | Support | Login</div>
          <p style="font-size:16px;margin:10px 0;">{title} - {sub} Click here to learn more about our many features and tools for teams everywhere today.</p>
          <div style="display:flex;gap:8px;">
            <button style="background:#d1d5db;color:#9ca3af;border:1px solid #9ca3af;padding:6px 10px;font-size:12px;">Learn More</button>
            <button style="background:#d1d5db;color:#9ca3af;border:1px solid #9ca3af;padding:6px 10px;font-size:12px;">{cta}</button>
            <button style="background:#d1d5db;color:#9ca3af;border:1px solid #9ca3af;padding:6px 10px;font-size:12px;">Download</button>
            <button style="background:#d1d5db;color:#9ca3af;border:1px solid #9ca3af;padding:6px 10px;font-size:12px;">Contact</button>
          </div>
        </div></body></html>"""

    return f"""<!doctype html><html><body style="margin:0;background:#ffffff;font-family:system-ui,-apple-system,sans-serif;color:#0e0e0e;">
    <div style="padding:20px 36px;border-bottom:1px solid #d9d9d4;display:flex;justify-content:space-between;align-items:center;">
      <strong style="font-size:16px;letter-spacing:-0.02em;">OKIKE</strong>
      <div style="display:flex;gap:24px;font-size:14px;color:#595954;"><span>Product</span><span>Pricing</span><span style="color:#0e0e0e;font-weight:700;">Sign in</span></div>
    </div>
    <div style="padding:48px 36px;max-width:560px;">
      <div style="font-family:monospace;font-size:12px;color:#595954;letter-spacing:0.12em;margin-bottom:12px;">CLEAR HIERARCHY &amp; CONTRAST</div>
      <h1 style="margin:0 0 14px;font-size:42px;line-height:1.05;letter-spacing:-0.03em;color:#0e0e0e;">{title}</h1>
      <p style="margin:0 0 28px;font-size:17px;line-height:1.5;color:#595954;">{sub}</p>
      <div style="display:flex;gap:12px;">
        <button style="background:#e3ee32;color:#0e0e0e;border:1px solid #0e0e0e;padding:14px 24px;font-size:15px;font-weight:700;">{cta} →</button>
        <button style="background:#ffffff;color:#0e0e0e;border:1px solid #d9d9d4;padding:14px 22px;font-size:15px;font-weight:600;">View Demo</button>
      </div>
    </div></body></html>"""


def _render_html_to_png(html: str, out_png: Path, width: int = 800, height: int = 500) -> bool:
    """Screenshots HTML/CSS cleanly using Playwright Chromium."""
    try:
        from playwright.sync_api import sync_playwright

        out_png.parent.mkdir(parents=True, exist_ok=True)
        with sync_playwright() as p:
            browser = p.chromium.launch(args=["--no-sandbox"])
            page = browser.new_page(viewport={"width": width, "height": height}, device_scale_factor=2)
            page.set_content(html, wait_until="networkidle")
            page.screenshot(path=str(out_png), type="png")
            browser.close()
        return True
    except Exception as exc:
        print(f"[Stage 4 Assets] Playwright screenshot skipped ({exc})")
        return False


def _extract_illustration_prompt(sc: dict[str, Any]) -> tuple[str, str]:
    """Pulls the Director's bespoke illustration prompt + alt_text for visual scenes."""
    spec = sc.get("visual_spec") or {}
    prompt = str(spec.get("illustration_prompt") or "").strip()
    alt_text = str(spec.get("alt_text") or "").strip()

    if not prompt and isinstance(sc.get("asset_requests"), list):
        for req in sc["asset_requests"]:
            if isinstance(req, dict) and (req.get("prompt") or req.get("illustration_prompt")):
                prompt = str(req.get("prompt") or req.get("illustration_prompt")).strip()
                alt_text = alt_text or str(req.get("alt_text") or "").strip()
                break
            if isinstance(req, str) and len(req.strip()) > 12:
                prompt = req.strip()
                break

    if not prompt and sc.get("scene_type") in ("analogy_illustration", "real_world_scenario"):
        heading = str(sc.get("on_screen_text") or "").strip()
        purpose = str(sc.get("purpose") or "").strip()
        prompt = f"Visual scene illustrating {heading}. {purpose}".strip()

    if not alt_text and prompt:
        alt_text = f"Editorial illustration: {sc.get('on_screen_text') or prompt[:80]}"

    return prompt, alt_text


def run_stage4_assets(
    scenes: list[dict[str, Any]],
    assets_dir: Path,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Generates & caches all scene assets:
      - ui_mockup -> Playwright HTML/CSS Good vs Bad screens
      - live_code_preview (HTML) -> Playwright live browser preview
      - analogy_illustration / real_world_scenario -> HuggingFace FLUX.1-schnell (or SDXL-Turbo)
    Returns (updated_scenes, licenses_list).
    """
    assets_dir.mkdir(parents=True, exist_ok=True)
    today = datetime.date.today().isoformat()
    licenses: list[dict[str, Any]] = []
    used_diffusion = False

    for idx, sc in enumerate(scenes):
        st = sc.get("scene_type")
        spec = sc.get("visual_spec") or {}
        generated_files: dict[str, str] = {}

        if st == "ui_mockup":
            tmpl = str(spec.get("ui_template") or "landing_hero")
            variant = str(spec.get("ui_variant") or "compare")
            variants = ["bad", "good"] if variant == "compare" else [variant]

            for v in variants:
                h = content_hash({"tmpl": tmpl, "v": v, "spec": spec})
                png = assets_dir / f"ui_{tmpl}_{v}_{h}.png"
                if not png.exists():
                    html = _build_ui_mockup_html(tmpl, v, spec)
                    _render_html_to_png(html, png)
                if png.exists():
                    generated_files[f"ui_{v}"] = png.name
                    licenses.append(
                        to_dict(
                            AssetRecord(
                                asset_id=png.stem,
                                asset_type="ui_mockup",
                                file_path=png.name,
                                alt_text=f"{v.title()} UI example for {sc.get('on_screen_text', tmpl)}",
                                source="Okike Academy HTML/CSS Template (Playwright)",
                                license="CC-BY-4.0 / Proprietary Okike Original",
                                author="Okike Academy Pipeline",
                                date=today,
                            )
                        )
                    )

        elif st == "live_code_preview" and str(spec.get("language", "")).lower() == "html":
            code = str(spec.get("code") or "")
            if code.strip():
                h = content_hash({"code": code})
                png = assets_dir / f"code_preview_{h}.png"
                if not png.exists():
                    _render_html_to_png(code, png, width=640, height=420)
                if png.exists():
                    generated_files["code_output"] = png.name
                    licenses.append(
                        to_dict(
                            AssetRecord(
                                asset_id=png.stem,
                                asset_type="code_preview",
                                file_path=png.name,
                                alt_text=f"Rendered HTML output for {sc.get('on_screen_text', 'code example')}",
                                source="Okike Academy Live HTML Renderer",
                                license="Original Educational Code",
                                author="Okike Academy Pipeline",
                                date=today,
                            )
                        )
                    )

        elif st in ("analogy_illustration", "real_world_scenario"):
            subject_prompt, alt_text = _extract_illustration_prompt(sc)
            if subject_prompt:
                h = content_hash({"style": OKIKE_STYLE_PREFIX, "prompt": subject_prompt})
                png = assets_dir / f"illus_{st}_{h}.png"
                model_used = os.environ.get("OKIKE_IMAGE_MODEL", "flux-schnell")
                full_prompt = OKIKE_STYLE_PREFIX + subject_prompt
                if not png.exists():
                    ok, model_used, full_prompt = _generate_editorial_illustration(
                        subject_prompt, png, seed=100 + idx * 17
                    )
                    if ok:
                        used_diffusion = True
                if png.exists():
                    generated_files["illustration"] = png.name
                    licenses.append(
                        to_dict(
                            AssetRecord(
                                asset_id=png.stem,
                                asset_type="ai_illustration",
                                file_path=png.name,
                                alt_text=alt_text,
                                source=f"AI Generated ({model_used})",
                                license="Apache-2.0 / Okike Academy Original",
                                author="Okike Academy Pipeline",
                                date=today,
                                prompt=full_prompt,
                            )
                        )
                    )

        if generated_files:
            sc["resolved_assets"] = generated_files

    if used_diffusion:
        _unload_image_pipeline()

    # Second pass: animate generated illustrations with Wan2.2-TI2V-5B (loads once, then unloads)
    used_video_anim = False
    for sc in scenes:
        assets = sc.get("resolved_assets") or {}
        illus_name = assets.get("illustration")
        if not illus_name:
            continue
        png_path = assets_dir / illus_name
        if not png_path.exists():
            continue
        subject_prompt, alt_text = _extract_illustration_prompt(sc)
        mp4_path = png_path.with_suffix(".mp4")
        if not mp4_path.exists():
            if _animate_illustration_with_wan(png_path, subject_prompt, mp4_path):
                used_video_anim = True
        if mp4_path.exists():
            assets["illustration_video"] = mp4_path.name
            sc["resolved_assets"] = assets
            licenses.append(
                to_dict(
                    AssetRecord(
                        asset_id=mp4_path.stem,
                        asset_type="ai_animated_illustration",
                        file_path=mp4_path.name,
                        alt_text=alt_text,
                        source=f"AI Animated ({os.environ.get('OKIKE_VIDEO_MODEL', 'Wan-AI/Wan2.2-TI2V-5B-Diffusers')})",
                        license="Apache-2.0 / Okike Academy Original",
                        author="Okike Academy Pipeline",
                        date=today,
                        prompt=subject_prompt,
                    )
                )
            )

    if used_video_anim:
        _unload_video_pipeline()

    (assets_dir / "licenses.json").write_text(
        json.dumps({"generated_at": today, "assets": licenses}, indent=2),
        encoding="utf-8",
    )
    return scenes, licenses
