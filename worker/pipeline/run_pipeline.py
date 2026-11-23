#!/usr/bin/env python3
"""
Okike Academy Institutional 7-Stage Pipeline Orchestrator
=========================================================
Runs Stages 1 -> 7 with JSON checkpointing per stage so any stage can be
re-run independently or resumed if Google Colab disconnects.

Usage:
  python -m worker.pipeline.run_pipeline \
    --course "Introduction to UI Design" \
    --module "Module 1: Visual Hierarchy & Contrast" \
    --lesson "Why Hierarchy Guides Every Click" \
    --level "Beginner" \
    --out-dir "./out/ui_lesson_01" \
    --voice "af_heart"
"""

from __future__ import annotations

import argparse
import datetime
import json
from pathlib import Path
from typing import Any

from .stage4_assets import run_stage4_assets
from .stage5_narration import run_stage5_narration
from .stage7_qa import run_stage7_qa_gate
from .stages_1_to_3 import plan_with_critic_loop, run_stage3_director


def _save_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def run_full_pipeline(
    course_title: str,
    module_title: str,
    lesson_title: str,
    level: str,
    out_dir: Path,
    voice: str = "af_heart",
    previous_sequences: list[list[str]] | None = None,
    resume: bool = True,
) -> dict[str, Any]:
    out_dir.mkdir(parents=True, exist_ok=True)

    # --- STAGE 1 & 2: Lesson Planner + Plan Critic ---
    plan_file = out_dir / "stage1_plan.json"
    critic_file = out_dir / "stage2_critic.json"
    if resume and plan_file.exists() and critic_file.exists():
        print("[Pipeline] Resuming from cached Stage 1-2 plan.")
        plan = _load_json(plan_file)
        critic_report = _load_json(critic_file)
    else:
        print("[Pipeline] Running Stage 1 (Planner) + Stage 2 (Critic)...")
        plan, critic_report = plan_with_critic_loop(
            course_title=course_title,
            module_title=module_title,
            lesson_title=lesson_title,
            level=level,
            previous_sequences=previous_sequences,
        )
        _save_json(plan_file, plan)
        _save_json(critic_file, critic_report)

    # --- STAGE 3: Scene Director ---
    scenes_file = out_dir / "stage3_scenes.json"
    if resume and scenes_file.exists():
        print("[Pipeline] Resuming from cached Stage 3 scene deck.")
        scenes = _load_json(scenes_file)
    else:
        print("[Pipeline] Running Stage 3 (Scene Director + Variety Validator)...")
        scenes = run_stage3_director(plan, previous_sequences=previous_sequences)
        _save_json(scenes_file, scenes)

    # --- STAGE 4: Asset Generator + License Log ---
    assets_dir = out_dir / "assets"
    print("[Pipeline] Running Stage 4 (HTML/CSS Mockups + License Logger)...")
    scenes, licenses = run_stage4_assets(scenes, assets_dir)
    _save_json(out_dir / "stage4_scenes_with_assets.json", scenes)

    # --- STAGE 5: Narration, Timing, -16 LUFS, Captions & Transcript ---
    audio_dir = out_dir / "audio"
    print("[Pipeline] Running Stage 5 (Kokoro-82M + -16 LUFS + VTT/SRT/Transcript)...")
    timing_bundle = run_stage5_narration(
        scenes=scenes,
        audio_dir=audio_dir,
        voice=voice,
        licenses=licenses,
    )
    _save_json(out_dir / "stage5_timing.json", timing_bundle)

    # --- STAGE 7: Automated QA Gate ---
    print("[Pipeline] Running Stage 7 (Automated Institutional QA Gate)...")
    qa_report = run_stage7_qa_gate(
        plan=plan,
        scenes=timing_bundle["scenes"],
        timing_bundle=timing_bundle,
        licenses=licenses,
        previous_sequences=previous_sequences,
    )
    _save_json(out_dir / "qa_report.json", qa_report)

    # Institutional metadata manifest
    metadata = {
        "title": lesson_title,
        "course": course_title,
        "module": module_title,
        "level": level,
        "language": plan.get("language", "English"),
        "learning_objective": plan.get("learning_objective"),
        "duration_seconds": timing_bundle["total_duration_sec"],
        "version": "okike-institutional-v6",
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "license_log": str(assets_dir / "licenses.json"),
        "qa_passed": qa_report["passed"],
        "critic_scores": critic_report.get("scores"),
        "reviewer": None,
    }
    _save_json(out_dir / "metadata.json", metadata)

    if not qa_report["passed"]:
        print(f"[QA GATE BLOCKED] {qa_report['failure_count']} failure(s):")
        for f in qa_report["failures"]:
            print("  -", f)
    else:
        print(
            f"[QA GATE PASSED] Ready for Stage 6 Render "
            f"({timing_bundle['total_duration_sec']:.1f}s, {len(scenes)} scenes)"
        )
    return {"metadata": metadata, "qa_report": qa_report, "timing": timing_bundle}


def main() -> None:
    parser = argparse.ArgumentParser(description="Okike Academy 7-Stage Institutional Video Pipeline")
    parser.add_argument("--course", required=True)
    parser.add_argument("--module", required=True)
    parser.add_argument("--lesson", required=True)
    parser.add_argument("--level", default="Beginner")
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--voice", default="af_heart")
    parser.add_argument("--no-resume", action="store_true")
    args = parser.parse_args()

    run_full_pipeline(
        course_title=args.course,
        module_title=args.module,
        lesson_title=args.lesson,
        level=args.level,
        out_dir=args.out_dir,
        voice=args.voice,
        resume=not args.no_resume,
    )


if __name__ == "__main__":
    main()
