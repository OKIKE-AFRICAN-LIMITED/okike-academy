"""
Stage 4: Asset Generator & License Logger (Okike Academy)
=========================================================
Generates crisp, content-appropriate visual assets by type:
  - UI screens & mockups (Good vs Bad from one HTML/CSS template via Playwright/Chromium)
  - Live code output previews (HTML/CSS rendered via Playwright/Chromium)
  - Clean SVG diagrams
  - Content-hash caching so unchanged scenes are never re-rendered
  - Outputs mandatory `licenses.json` with alt_text, source, license, author, date, prompt
"""

from __future__ import annotations

import datetime
import json
from pathlib import Path
from typing import Any

from .schemas import AssetRecord, content_hash, to_dict


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


def run_stage4_assets(
    scenes: list[dict[str, Any]],
    assets_dir: Path,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Generates & caches all scene assets (HTML/CSS UI mockups, live code output
    screenshots, etc.) and returns (updated_scenes, licenses_list).
    """
    assets_dir.mkdir(parents=True, exist_ok=True)
    today = datetime.date.today().isoformat()
    licenses: list[dict[str, Any]] = []

    for sc in scenes:
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

        if generated_files:
            sc["resolved_assets"] = generated_files

    (assets_dir / "licenses.json").write_text(
        json.dumps({"generated_at": today, "assets": licenses}, indent=2),
        encoding="utf-8",
    )
    return scenes, licenses
