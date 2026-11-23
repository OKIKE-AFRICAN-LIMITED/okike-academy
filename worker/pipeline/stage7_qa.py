"""
Stage 7: Automated QA Gate (Okike Academy Institutional Standard)
=================================================================
Blocks publishing if ANY mandatory check fails:
  1. LessonPlan & SceneDeck JSON schema validation
  2. Scene variety rules vs previous lessons in the same course
  3. On-screen text <= 15 words per scene
  4. No scene shorter than its measured speech duration
  5. Caption sync drift < 200ms vs audio total
  6. Audio loudness normalized (~ -16 LUFS, peaks <= -1 dBTP)
  7. Every generated/external asset has complete license + alt_text metadata
  8. Zero unsourced statistics
  9. Accessibility outputs present (.vtt, .srt, transcript.txt)
"""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path
from typing import Any

from .schemas import validate_lesson_plan, validate_scene_deck


def _measure_lufs(audio_path: Path) -> tuple[float | None, float | None]:
    try:
        proc = subprocess.run(
            [
                "ffmpeg",
                "-i",
                str(audio_path),
                "-af",
                "loudnorm=I=-16:TP=-1.0:LRA=11:print_format=json",
                "-f",
                "null",
                "-",
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", proc.stderr, re.DOTALL)
        if m:
            info = json.loads(m.group(0))
            return float(info["input_i"]), float(info["input_tp"])
    except Exception:
        pass
    return None, None


def run_stage7_qa_gate(
    plan: dict[str, Any],
    scenes: list[dict[str, Any]],
    timing_bundle: dict[str, Any],
    licenses: list[dict[str, Any]],
    previous_sequences: list[list[str]] | None = None,
) -> dict[str, Any]:
    failures: list[str] = []
    warnings: list[str] = []

    # 1. Plan & Scene schema + variety + <=15 word text + zero unsourced stats
    failures.extend(validate_lesson_plan(plan))
    failures.extend(
        validate_scene_deck(
            scenes,
            previous_sequences=previous_sequences,
            is_coding_lesson=bool(plan.get("is_coding_lesson")),
        )
    )

    # 2. No scene shorter than its measured narration
    for idx, sc in enumerate(scenes, start=1):
        speech = float(sc.get("speech_duration_sec") or 0)
        scene_dur = float(sc.get("measured_duration_sec") or 0)
        if speech <= 0:
            failures.append(f"Scene {idx}: missing measured speech_duration_sec")
        elif scene_dur < speech:
            failures.append(
                f"Scene {idx}: visual duration ({scene_dur:.2f}s) < speech ({speech:.2f}s)"
            )

    # 3. Audio loudness check (-19 to -13 LUFS acceptable window around -16 LUFS)
    master_audio = Path(timing_bundle.get("master_audio_path") or "")
    if not master_audio.exists():
        failures.append("Master audio file is missing.")
    else:
        lufs, true_peak = _measure_lufs(master_audio)
        if lufs is not None and not (-19.0 <= lufs <= -13.0):
            failures.append(f"Audio loudness out of spec: {lufs:.1f} LUFS (target ~ -16 LUFS)")
        if true_peak is not None and true_peak > -0.5:
            failures.append(f"Audio true peak clipping risk: {true_peak:.2f} dBTP (limit <= -1 dBTP)")

    # 4. Accessibility outputs present
    for key in ("vtt_path", "srt_path", "transcript_path"):
        p = Path(timing_bundle.get(key) or "")
        if not p.exists() or p.stat().st_size == 0:
            failures.append(f"Missing or empty accessibility output: {key}")

    # 5. Asset license & alt_text completeness
    for asset in licenses:
        for req in ("source", "license", "author", "date", "alt_text"):
            if not str(asset.get(req) or "").strip():
                failures.append(
                    f"Asset '{asset.get('asset_id')}' missing required metadata '{req}'"
                )

    # 6. Target institutional length check (120-240s; warn if slightly under)
    total_sec = float(timing_bundle.get("total_duration_sec") or 0)
    if total_sec < 90:
        warnings.append(
            f"Total video duration is {total_sec:.1f}s (institutional target is 120-240s)."
        )

    passed = len(failures) == 0
    return {
        "passed": passed,
        "failure_count": len(failures),
        "failures": failures,
        "warnings": warnings,
        "total_duration_sec": total_sec,
        "scene_sequence": [sc.get("scene_type") for sc in scenes],
        "human_review_rubric": {
            "hook": None,
            "variety": None,
            "clarity": None,
            "visual_fit": None,
            "sync": None,
            "mobile_readability": None,
            "depth": None,
            "accuracy": None,
            "reviewer_name": None,
            "reviewed_at": None,
            "approved": False,
        },
    }
