"""
Okike Academy Institutional Video Pipeline — Schemas & Hard Validators
======================================================================
Enforces Section 4-11 of the Engineering Brief in Python code (not only prompts):
  - Single measurable objective, 120-240s target duration
  - 11 institutional scene types
  - No duplicate scene sequence vs previous lessons in the same course
  - Max 2 occurrences of any scene type (except live_code_preview in coding courses)
  - Max 15 words on-screen text per scene
  - Zero unsourced statistics (hard error if data_scene has no source)
  - Presenter avatar restricted to hook_scene / recap_scene only
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import asdict, dataclass, field
from typing import Any, Literal

SceneType = Literal[
    "hook_scene",
    "process_flow",
    "before_after",
    "live_code_preview",
    "ui_mockup",
    "analogy_illustration",
    "real_world_scenario",
    "pause_and_predict",
    "key_term_callout",
    "data_scene",
    "recap_scene",
]

VALID_SCENE_TYPES: set[str] = {
    "hook_scene",
    "process_flow",
    "before_after",
    "live_code_preview",
    "ui_mockup",
    "analogy_illustration",
    "real_world_scenario",
    "pause_and_predict",
    "key_term_callout",
    "data_scene",
    "recap_scene",
}

VALID_MOTIONS: set[str] = {"reveal", "compare", "transform", "highlight"}

BANNED_FILLER_OPENERS = (
    "welcome to a crucial lesson",
    "welcome to this exciting lesson",
    "in this video we will",
    "hello everyone and welcome",
)


def content_hash(obj: Any) -> str:
    raw = json.dumps(obj, sort_keys=True, ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:16]


@dataclass
class SourceRef:
    claim: str
    source_name: str
    url_or_citation: str
    year: str = ""


@dataclass
class LessonPlan:
    course_title: str
    module_title: str
    lesson_title: str
    level: str
    language: str
    learning_objective: str
    hook: str
    key_ideas: list[str]
    analogy: str
    worked_example: str
    common_mistake: str
    check_for_understanding: dict[str, str]  # {"question": ..., "answer": ...}
    recap: list[str]
    visual_needs: list[dict[str, str]]  # [{"idea": ..., "visual_type": ...}]
    target_duration_seconds: int = 160
    sources: list[dict[str, str]] = field(default_factory=list)
    is_coding_lesson: bool = False


@dataclass
class CriticScores:
    hook_strength: int
    objective_clarity: int
    variety_vs_previous: int
    depth: int
    accuracy_risk: int
    visual_fit: int
    reasons: dict[str, str]
    revision_instructions: str = ""

    @property
    def passed(self) -> bool:
        return all(
            s >= 4
            for s in (
                self.hook_strength,
                self.objective_clarity,
                self.variety_vs_previous,
                self.depth,
                self.accuracy_risk,
                self.visual_fit,
            )
        )


@dataclass
class AssetRecord:
    asset_id: str
    asset_type: str  # ui_mockup | diagram | code_preview | illustration | photo
    file_path: str
    alt_text: str
    source: str
    license: str
    author: str
    date: str
    prompt: str = ""


@dataclass
class DirectedScene:
    scene_id: str
    scene_type: str
    purpose: str
    duration_hint: float
    on_screen_text: str
    narration: str
    visual_spec: dict[str, Any]
    motion: str
    asset_requests: list[dict[str, Any]] = field(default_factory=list)
    use_presenter_avatar: bool = False
    source_citation: str = ""
    # Populated in Stage 5 (measured audio timing)
    audio_path: str = ""
    measured_duration_sec: float = 0.0
    word_timestamps: list[dict[str, Any]] = field(default_factory=list)


def validate_lesson_plan(plan: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    required = [
        "learning_objective",
        "hook",
        "key_ideas",
        "analogy",
        "worked_example",
        "common_mistake",
        "check_for_understanding",
        "recap",
        "visual_needs",
        "target_duration_seconds",
    ]
    for k in required:
        if not plan.get(k):
            errors.append(f"Missing required LessonPlan field: '{k}'")

    ideas = plan.get("key_ideas") or []
    if not (2 <= len(ideas) <= 4):
        errors.append(f"key_ideas must have 2 to 4 items (got {len(ideas)})")

    dur = int(plan.get("target_duration_seconds") or 0)
    if not (120 <= dur <= 240):
        errors.append(
            f"target_duration_seconds must be 120-240s (got {dur}s)"
        )

    check = plan.get("check_for_understanding") or {}
    if not check.get("question") or not check.get("answer"):
        errors.append("check_for_understanding must include 'question' and 'answer'")

    recap = plan.get("recap") or []
    if not (2 <= len(recap) <= 3):
        errors.append(f"recap must have 2 to 3 lines (got {len(recap)})")

    return errors


def validate_scene_deck(
    scenes: list[dict[str, Any]],
    previous_sequences: list[list[str]] | None = None,
    is_coding_lesson: bool = False,
) -> list[str]:
    errors: list[str] = []
    if len(scenes) < 5:
        errors.append(f"Scene deck too short ({len(scenes)} scenes; need >= 5 for 2-4 min lesson)")
        return errors

    seq: list[str] = []
    counts: dict[str, int] = {}

    for idx, sc in enumerate(scenes, start=1):
        st = str(sc.get("scene_type") or "")
        seq.append(st)
        counts[st] = counts.get(st, 0) + 1

        if st not in VALID_SCENE_TYPES:
            errors.append(f"Scene {idx}: invalid scene_type '{st}'")

        motion = str(sc.get("motion") or "")
        if motion not in VALID_MOTIONS:
            errors.append(f"Scene {idx}: invalid motion '{motion}' (must be reveal/compare/transform/highlight)")

        # <= 15 words on screen
        on_screen = str(sc.get("on_screen_text") or "").strip()
        word_count = len([w for w in on_screen.split() if w])
        if word_count == 0:
            errors.append(f"Scene {idx}: on_screen_text cannot be empty")
        elif word_count > 15:
            errors.append(
                f"Scene {idx}: on_screen_text has {word_count} words (max 15): '{on_screen}'"
            )

        # No filler openers
        narration = str(sc.get("narration") or "").strip()
        if not narration:
            errors.append(f"Scene {idx}: narration is empty")
        lower_n = narration.lower()
        for banned in BANNED_FILLER_OPENERS:
            if lower_n.startswith(banned):
                errors.append(f"Scene {idx}: narration uses banned filler opener '{banned}'")

        # Presenter avatar ONLY in hook_scene (first) or recap_scene (last)
        if sc.get("use_presenter_avatar") and st not in ("hook_scene", "recap_scene"):
            errors.append(
                f"Scene {idx} ({st}): presenter avatar is only allowed on hook_scene and recap_scene"
            )

        # Unsourced statistics hard check
        if st == "data_scene":
            src = str(sc.get("source_citation") or "").strip()
            if not src:
                errors.append(
                    f"Scene {idx}: data_scene MUST include a non-empty 'source_citation'"
                )
        else:
            # Flag percentage claims in narration/on-screen text without source or illustrative label
            has_pct = bool(re.search(r"\b\d+\s*%", on_screen))
            if has_pct and not sc.get("source_citation") and "illustrative" not in lower_n:
                errors.append(
                    f"Scene {idx}: contains percentage in on_screen_text without source_citation or illustrative label"
                )

    # Max 2 occurrences per scene type (except live_code_preview in coding lessons)
    for st, cnt in counts.items():
        if st == "live_code_preview" and is_coding_lesson:
            continue
        if st == "data_scene" and cnt > 1:
            errors.append("data_scene may appear at most once per lesson")
        elif cnt > 2:
            errors.append(f"scene_type '{st}' appears {cnt} times (max 2 per lesson)")

    # Must include check for understanding (pause_and_predict) & recap
    if "pause_and_predict" not in counts:
        errors.append("Lesson must include a 'pause_and_predict' check-for-understanding scene")
    if "recap_scene" not in counts:
        errors.append("Lesson must include a 'recap_scene'")

    # Variety vs previous lessons in the same course
    if previous_sequences:
        for prev_idx, prev_seq in enumerate(previous_sequences, start=1):
            if seq == prev_seq:
                errors.append(
                    f"Scene sequence is identical to previous lesson #{prev_idx}: {seq}"
                )

    return errors


def to_dict(obj: Any) -> Any:
    if hasattr(obj, "__dataclass_fields__"):
        return asdict(obj)
    return obj
