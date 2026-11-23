"""
Stages 1, 2 & 3 of the Okike Academy Institutional Video Pipeline
=================================================================
- Stage 1: Lesson Planner  (JSON in -> validated LessonPlan JSON out)
- Stage 2: Plan Critic     (separate LLM call, scores 1-5 on 6 criteria, max 2 revision loops)
- Stage 3: Scene Director  (converts approved plan to validated 6-9 scene deck from 11-type library)
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .llm_client import call_gemini_json
from .schemas import CriticScores, validate_lesson_plan, validate_scene_deck

PROMPTS_DIR = Path(__file__).resolve().parent / "prompts"


def run_stage1_planner(
    course_title: str,
    module_title: str,
    lesson_title: str,
    level: str = "Beginner",
    language: str = "English",
    revision_feedback: str = "",
    prior_plan: dict[str, Any] | None = None,
) -> dict[str, Any]:
    template = (PROMPTS_DIR / "stage1_planner.txt").read_text(encoding="utf-8")
    prompt = template.format(
        course_title=course_title,
        module_title=module_title,
        lesson_title=lesson_title,
        level=level,
        language=language,
    )
    if revision_feedback and prior_plan:
        prompt += (
            "\n\nREVISION REQUIRED BY CRITIC:\n"
            f"Previous plan:\n{json.dumps(prior_plan, indent=2)}\n\n"
            f"Fix every issue below while keeping valid JSON:\n{revision_feedback}"
        )

    plan = call_gemini_json(prompt, temperature=0.45)
    plan.setdefault("course_title", course_title)
    plan.setdefault("module_title", module_title)
    plan.setdefault("lesson_title", lesson_title)
    plan.setdefault("level", level)
    plan.setdefault("language", language)

    errors = validate_lesson_plan(plan)
    if errors:
        raise ValueError(f"Stage 1 LessonPlan validation failed: {errors}")
    return plan


def run_stage2_critic(
    plan: dict[str, Any],
    previous_sequences: list[list[str]] | None = None,
) -> CriticScores:
    template = (PROMPTS_DIR / "stage2_critic.txt").read_text(encoding="utf-8")
    prompt = template.format(
        previous_sequences=json.dumps(previous_sequences or [], indent=2),
        plan_json=json.dumps(plan, indent=2),
    )
    raw = call_gemini_json(prompt, temperature=0.2)
    return CriticScores(
        hook_strength=int(raw.get("hook_strength", 1)),
        objective_clarity=int(raw.get("objective_clarity", 1)),
        variety_vs_previous=int(raw.get("variety_vs_previous", 1)),
        depth=int(raw.get("depth", 1)),
        accuracy_risk=int(raw.get("accuracy_risk", 1)),
        visual_fit=int(raw.get("visual_fit", 1)),
        reasons=raw.get("reasons") or {},
        revision_instructions=str(raw.get("revision_instructions") or ""),
    )


def plan_with_critic_loop(
    course_title: str,
    module_title: str,
    lesson_title: str,
    level: str = "Beginner",
    language: str = "English",
    previous_sequences: list[list[str]] | None = None,
    max_revisions: int = 2,
) -> tuple[dict[str, Any], dict[str, Any]]:
    plan = run_stage1_planner(course_title, module_title, lesson_title, level, language)
    critic = run_stage2_critic(plan, previous_sequences)
    revisions_used = 0

    while not critic.passed and revisions_used < max_revisions:
        revisions_used += 1
        print(
            f"[Stage 2 Critic] Revision loop {revisions_used}/{max_revisions}: "
            f"{critic.revision_instructions[:140]}"
        )
        plan = run_stage1_planner(
            course_title,
            module_title,
            lesson_title,
            level,
            language,
            revision_feedback=critic.revision_instructions,
            prior_plan=plan,
        )
        critic = run_stage2_critic(plan, previous_sequences)

    report = {
        "passed": critic.passed,
        "revisions_used": revisions_used,
        "scores": {
            "hook_strength": critic.hook_strength,
            "objective_clarity": critic.objective_clarity,
            "variety_vs_previous": critic.variety_vs_previous,
            "depth": critic.depth,
            "accuracy_risk": critic.accuracy_risk,
            "visual_fit": critic.visual_fit,
        },
        "reasons": critic.reasons,
        "revision_instructions": critic.revision_instructions,
    }
    return plan, report


def run_stage3_director(
    plan: dict[str, Any],
    previous_sequences: list[list[str]] | None = None,
    max_attempts: int = 2,
) -> list[dict[str, Any]]:
    template = (PROMPTS_DIR / "stage3_director.txt").read_text(encoding="utf-8")
    base_prompt = template.format(
        plan_json=json.dumps(plan, indent=2),
        previous_sequences=json.dumps(previous_sequences or [], indent=2),
        target_duration=plan.get("target_duration_seconds", 160),
    )

    last_errors: list[str] = []
    prompt = base_prompt

    for attempt in range(1, max_attempts + 1):
        raw = call_gemini_json(prompt, temperature=0.35)
        scenes = raw.get("scenes") or []
        last_errors = validate_scene_deck(
            scenes,
            previous_sequences=previous_sequences,
            is_coding_lesson=bool(plan.get("is_coding_lesson")),
        )
        if not last_errors:
            return scenes

        print(
            f"[Stage 3 Director] Validation attempt {attempt} caught {len(last_errors)} issue(s); repairing..."
        )
        prompt = (
            base_prompt
            + "\n\nYOUR PREVIOUS SCENE LIST FAILED VALIDATION. FIX EVERY ERROR BELOW:\n- "
            + "\n- ".join(last_errors)
            + f"\n\nPrevious JSON:\n{json.dumps(raw, indent=2)}"
        )

    raise ValueError(f"Stage 3 Scene Director failed validation: {last_errors}")
