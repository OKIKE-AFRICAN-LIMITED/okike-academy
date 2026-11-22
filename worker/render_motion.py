#!/usr/bin/env python3
"""
OpenAcademy Pro Motion-Graphics Video Engine ($0 Cost)
======================================================
Renders Fireship / 3Blue1Brown-style synced motion-graphics lesson videos using:
  - Manim (vector motion graphics, animated diagrams, code walkthroughs, flowcharts)
  - Kokoro-82M ONNX (studio-quality human neural voiceover, runs locally or on Colab)
  - Automatic WebVTT (.vtt) subtitles synced to every scene

Usage (Single Lesson):
  python render_motion.py --storyboard-json storyboard.json --output lesson.mp4 --voice am_michael --quality m

Usage (Live Server Mode):
  python render_motion.py --server-url https://your-app.vercel.app --voice am_michael --quality m
"""

import argparse
import asyncio
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path
from typing import Any

import requests

KOKORO_MODEL_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx"
KOKORO_VOICES_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"

CACHE_DIR = Path(__file__).resolve().parent / ".cache" / "kokoro"

MANIM_SCENE_TEMPLATE = r'''
import json
import textwrap
from pathlib import Path
from manim import *

config.background_color = "#0E0E0E"

DATA = json.loads(Path("scene_manifest.json").read_text(encoding="utf-8"))
SCENES = DATA["scenes"]
COURSE_TITLE = DATA.get("courseTitle", "OKIKE ACADEMY")[:34].upper()

EMERALD = "#E3EE32"
SKY = "#C4B0F0"
AMBER = "#F7F7F2"
ROSE = "#D9CCF2"
SLATE_CARD = "#1A1A18"
SLATE_BORDER = "#3A3A36"
MUTED = "#A6A69E"
ACCENTS = [EMERALD, SKY, AMBER, ROSE]


def wrap_txt(s: str, width: int = 34) -> str:
    return "\n".join(textwrap.wrap(str(s or "").strip(), width=width))


class AcademyMotionLesson(Scene):
    def add_subtle_grid(self):
        grid = NumberPlane(
            x_range=[-8, 8, 1],
            y_range=[-5, 5, 1],
            background_line_style={
                "stroke_color": "#1E293B",
                "stroke_width": 1,
                "stroke_opacity": 0.45,
            },
            axis_config={"stroke_opacity": 0},
        )
        self.add(grid)

    def make_progress_bar(self, idx: int, total: int):
        bar_w = 12.2
        bg = RoundedRectangle(
            corner_radius=0.04, width=bar_w, height=0.08,
            fill_color=SLATE_BORDER, fill_opacity=0.8, stroke_width=0
        ).to_edge(DOWN, buff=0.22)
        fill_w = max(0.2, bar_w * (idx / max(1, total)))
        fg = RoundedRectangle(
            corner_radius=0.04, width=fill_w, height=0.08,
            fill_color=EMERALD, fill_opacity=1, stroke_width=0
        ).align_to(bg, LEFT).align_to(bg, DOWN)
        return VGroup(bg, fg)

    def render_title_hook(self, sc, dur):
        badge = RoundedRectangle(
            corner_radius=0.2, width=4.6, height=0.52,
            fill_color=EMERALD, fill_opacity=0.18, stroke_color=EMERALD, stroke_width=2
        ).to_edge(UP, buff=0.75)
        badge_txt = Text(COURSE_TITLE, font_size=16, color=EMERALD, weight=BOLD).move_to(badge)

        heading = Text(wrap_txt(sc.get("heading") or "Lesson Overview", 28), font_size=52, color=WHITE, weight=BOLD).next_to(badge, DOWN, buff=0.5)
        subtitle_str = sc.get("subtitle") or ""
        subtitle = Text(wrap_txt(subtitle_str, 46), font_size=26, color=MUTED).next_to(heading, DOWN, buff=0.3)

        frame = RoundedRectangle(
            corner_radius=0.2, width=7.8, height=2.6,
            fill_color=SLATE_CARD, fill_opacity=0.95, stroke_color=SLATE_BORDER, stroke_width=2.5
        ).next_to(subtitle if subtitle_str else heading, DOWN, buff=0.5)
        topbar = Line(frame.get_corner(UL) + DOWN * 0.48, frame.get_corner(UR) + DOWN * 0.48, color=SLATE_BORDER, stroke_width=2)
        dots = VGroup(*[Dot(radius=0.075, color=c) for c in ("#EF4444", "#F59E0B", "#10B981")]).arrange(RIGHT, buff=0.13).move_to(frame.get_corner(UL) + RIGHT * 0.6 + DOWN * 0.24)

        bars = VGroup(
            RoundedRectangle(corner_radius=0.07, width=3.8, height=0.38, fill_color=EMERALD, fill_opacity=0.85, stroke_width=0),
            RoundedRectangle(corner_radius=0.06, width=6.1, height=0.2, fill_color="#64748B", fill_opacity=0.65, stroke_width=0),
            RoundedRectangle(corner_radius=0.06, width=4.7, height=0.2, fill_color="#64748B", fill_opacity=0.45, stroke_width=0),
            RoundedRectangle(corner_radius=0.08, width=2.0, height=0.36, fill_color=SKY, fill_opacity=0.85, stroke_width=0),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.2).move_to(frame.get_center() + DOWN * 0.22)

        self.play(FadeIn(badge, shift=DOWN * 0.2), Write(badge_txt), run_time=0.6)
        self.play(Write(heading), FadeIn(subtitle, shift=UP * 0.2), run_time=0.9)
        self.play(Create(frame), Create(topbar), FadeIn(dots), run_time=0.8)
        self.play(LaggedStart(*[GrowFromEdge(b, LEFT) for b in bars], lag_ratio=0.18), run_time=1.2)
        self.wait(max(0.3, dur - 3.5 + 0.3))
        return VGroup(badge, badge_txt, heading, subtitle, frame, topbar, dots, bars)

    def render_flow_diagram(self, sc, dur):
        heading = Text(wrap_txt(sc.get("heading") or "Step-by-Step Flow", 34), font_size=40, color=WHITE, weight=BOLD).to_edge(UP, buff=0.65)
        bullets = (sc.get("bullets") or ["Step 1", "Step 2", "Step 3"])[:4]
        n = len(bullets)
        box_w = min(3.2, 10.6 / max(1, n) - 0.55)

        nodes = VGroup()
        for i, item in enumerate(bullets):
            col = ACCENTS[i % len(ACCENTS)]
            box = RoundedRectangle(
                corner_radius=0.18, width=box_w, height=2.5,
                fill_color=SLATE_CARD, fill_opacity=1, stroke_color=col, stroke_width=2.5
            )
            num_c = Circle(radius=0.28, fill_color=col, fill_opacity=0.22, stroke_color=col, stroke_width=2).move_to(box.get_top() + DOWN * 0.52)
            num_t = Text(str(i + 1), font_size=22, color=col, weight=BOLD).move_to(num_c)
            lbl = Text(wrap_txt(item, 16), font_size=21, color=WHITE).next_to(num_c, DOWN, buff=0.32)
            nodes.add(VGroup(box, num_c, num_t, lbl))

        nodes.arrange(RIGHT, buff=0.65).shift(DOWN * 0.15)
        arrows = VGroup()
        for i in range(len(nodes) - 1):
            arr = Arrow(nodes[i].get_right(), nodes[i + 1].get_left(), buff=0.08, color=EMERALD, stroke_width=3.5)
            arrows.add(arr)

        self.play(Write(heading), run_time=0.7)
        elapsed = 0.7
        for i, node in enumerate(nodes):
            self.play(FadeIn(node, shift=UP * 0.3), run_time=0.75)
            elapsed += 0.75
            if i < len(arrows):
                self.play(GrowArrow(arrows[i]), run_time=0.4)
                elapsed += 0.4
        self.wait(max(0.3, dur - elapsed + 0.3))
        return VGroup(heading, nodes, arrows)

    def render_code_walkthrough(self, sc, dur):
        heading = Text(wrap_txt(sc.get("heading") or "Code Breakdown", 34), font_size=38, color=WHITE, weight=BOLD).to_edge(UP, buff=0.55)
        code_str = (sc.get("codeSnippet") or "<h1>Hello, Academy!</h1>").strip()
        lines = code_str.splitlines()[:6]

        ide = RoundedRectangle(
            corner_radius=0.2, width=10.8, height=3.1,
            fill_color="#0B1120", fill_opacity=1, stroke_color=SLATE_BORDER, stroke_width=2.5
        ).next_to(heading, DOWN, buff=0.45)
        ide_bar = Line(ide.get_corner(UL) + DOWN * 0.45, ide.get_corner(UR) + DOWN * 0.45, color=SLATE_BORDER, stroke_width=2)
        dots = VGroup(*[Dot(radius=0.07, color=c) for c in ("#EF4444", "#F59E0B", "#10B981")]).arrange(RIGHT, buff=0.12).move_to(ide.get_corner(UL) + RIGHT * 0.55 + DOWN * 0.22)

        code_mobs = VGroup(*[
            Text(ln[:54], font="Monospace", font_size=24, color=EMERALD if i == 0 else SKY if i % 2 == 1 else WHITE)
            for i, ln in enumerate(lines)
        ]).arrange(DOWN, aligned_edge=LEFT, buff=0.18).move_to(ide.get_center() + DOWN * 0.18).align_to(ide.get_left() + RIGHT * 0.5, LEFT)

        bullets = (sc.get("bullets") or [])[:3]
        pills = VGroup()
        for i, b in enumerate(bullets):
            col = ACCENTS[i % len(ACCENTS)]
            pbox = RoundedRectangle(corner_radius=0.14, width=3.35, height=0.78, fill_color=col, fill_opacity=0.16, stroke_color=col, stroke_width=2)
            ptxt = Text(wrap_txt(b, 20), font_size=18, color=WHITE, weight=BOLD).move_to(pbox)
            pills.add(VGroup(pbox, ptxt))
        if len(pills) > 0:
            pills.arrange(RIGHT, buff=0.32).next_to(ide, DOWN, buff=0.42)

        self.play(Write(heading), Create(ide), Create(ide_bar), FadeIn(dots), run_time=0.9)
        self.play(LaggedStart(*[Write(m) for m in code_mobs], lag_ratio=0.25), run_time=1.6)
        elapsed = 2.5
        if len(pills) > 0:
            self.play(LaggedStart(*[FadeIn(p, shift=UP * 0.2) for p in pills], lag_ratio=0.22), run_time=1.1)
            elapsed += 1.1
        self.wait(max(0.3, dur - elapsed + 0.3))
        return VGroup(heading, ide, ide_bar, dots, code_mobs, pills)

    def render_concept_cards(self, sc, dur):
        heading = Text(wrap_txt(sc.get("heading") or "Core Concepts", 34), font_size=40, color=WHITE, weight=BOLD).to_edge(UP, buff=0.65)
        bullets = (sc.get("bullets") or ["Concept 1", "Concept 2", "Concept 3"])[:3]
        cards = VGroup()
        for i, item in enumerate(bullets):
            col = ACCENTS[i % len(ACCENTS)]
            c = RoundedRectangle(
                corner_radius=0.2, width=3.55, height=3.4,
                fill_color=SLATE_CARD, fill_opacity=1, stroke_color=SLATE_BORDER, stroke_width=2
            )
            top_bar = RoundedRectangle(
                corner_radius=0.06, width=3.1, height=0.12,
                fill_color=col, fill_opacity=1, stroke_width=0
            ).move_to(c.get_top() + DOWN * 0.25)
            num = Text(f"0{i + 1}", font_size=34, color=col, weight=BOLD).next_to(top_bar, DOWN, buff=0.35)
            txt = Text(wrap_txt(item, 18), font_size=23, color=WHITE).next_to(num, DOWN, buff=0.35)
            cards.add(VGroup(c, top_bar, num, txt))
        cards.arrange(RIGHT, buff=0.45).shift(DOWN * 0.2)

        self.play(Write(heading), run_time=0.7)
        self.play(LaggedStart(*[FadeIn(c, shift=UP * 0.35) for c in cards], lag_ratio=0.3), run_time=1.9)
        self.wait(max(0.3, dur - 2.6 + 0.3))
        return VGroup(heading, cards)

    def render_comparison(self, sc, dur):
        heading = Text(wrap_txt(sc.get("heading") or "Key Comparison", 34), font_size=40, color=WHITE, weight=BOLD).to_edge(UP, buff=0.65)
        bullets = (sc.get("bullets") or ["Traditional Approach", "Modern Approach"])[:4]
        mid = max(1, len(bullets) // 2)
        left_items = bullets[:mid]
        right_items = bullets[mid:] or ["Better Practice"]

        def build_col(title_txt, items, col):
            box = RoundedRectangle(corner_radius=0.2, width=5.4, height=3.8, fill_color=SLATE_CARD, fill_opacity=1, stroke_color=col, stroke_width=2.5)
            t = Text(title_txt, font_size=26, color=col, weight=BOLD).move_to(box.get_top() + DOWN * 0.5)
            body = VGroup(*[Text("• " + wrap_txt(it, 26), font_size=22, color=WHITE) for it in items]).arrange(DOWN, aligned_edge=LEFT, buff=0.35).next_to(t, DOWN, buff=0.45)
            return VGroup(box, t, body)

        cols = VGroup(
            build_col("Approach A", left_items, SKY),
            build_col("Approach B", right_items, EMERALD),
        ).arrange(RIGHT, buff=0.6).shift(DOWN * 0.25)

        self.play(Write(heading), run_time=0.7)
        self.play(FadeIn(cols[0], shift=RIGHT * 0.35), run_time=0.9)
        self.play(FadeIn(cols[1], shift=LEFT * 0.35), run_time=0.9)
        self.wait(max(0.3, dur - 2.5 + 0.3))
        return VGroup(heading, cols)

    def render_takeaways(self, sc, dur):
        heading = Text(wrap_txt(sc.get("heading") or "Key Takeaways", 30), font_size=42, color=EMERALD, weight=BOLD).to_edge(UP, buff=0.65)
        bullets = (sc.get("bullets") or ["Review the lesson notes", "Try the interactive example", "Complete the quick quiz"])[:4]
        rows = VGroup()
        for i, item in enumerate(bullets):
            card = RoundedRectangle(
                corner_radius=0.16, width=10.8, height=1.0,
                fill_color=SLATE_CARD, fill_opacity=1, stroke_color=EMERALD, stroke_width=2
            )
            badge = Circle(radius=0.25, fill_color=EMERALD, fill_opacity=0.2, stroke_color=EMERALD, stroke_width=2).move_to(card.get_left() + RIGHT * 0.55)
            num = Text(str(i + 1), font_size=20, color=EMERALD, weight=BOLD).move_to(badge)
            txt = Text(wrap_txt(item, 52), font_size=24, color=WHITE).next_to(badge, RIGHT, buff=0.35)
            rows.add(VGroup(card, badge, num, txt))
        rows.arrange(DOWN, buff=0.3).next_to(heading, DOWN, buff=0.55)

        self.play(Write(heading), run_time=0.7)
        self.play(LaggedStart(*[FadeIn(r, shift=UP * 0.25) for r in rows], lag_ratio=0.3), run_time=1.8)
        self.wait(max(0.4, dur - 2.5 + 0.4))
        return VGroup(heading, rows)

    def construct(self):
        self.add_subtle_grid()
        total = len(SCENES)
        for idx, sc in enumerate(SCENES, start=1):
            audio_file = sc["audioPath"]
            dur = float(sc["durationSec"])
            self.add_sound(audio_file)

            prog = self.make_progress_bar(idx, total)
            self.add(prog)

            tmpl = sc.get("template") or ("title_hook" if idx == 1 else "takeaways" if idx == total else "concept_cards")
            if tmpl == "title_hook":
                grp = self.render_title_hook(sc, dur)
            elif tmpl == "flow_diagram":
                grp = self.render_flow_diagram(sc, dur)
            elif tmpl == "code_walkthrough":
                grp = self.render_code_walkthrough(sc, dur)
            elif tmpl == "comparison":
                grp = self.render_comparison(sc, dur)
            elif tmpl == "takeaways":
                grp = self.render_takeaways(sc, dur)
            else:
                grp = self.render_concept_cards(sc, dur)

            if idx < total:
                self.play(FadeOut(grp, shift=UP * 0.35), run_time=0.45)
            self.remove(prog)
'''


def ensure_kokoro_weights() -> tuple[Path, Path]:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    model_path = CACHE_DIR / "kokoro-v1.0.onnx"
    voices_path = CACHE_DIR / "voices-v1.0.bin"
    if not model_path.exists():
        print("[MotionWorker] Downloading Kokoro-82M ONNX model (~82 MB, one-time)...")
        urllib.request.urlretrieve(KOKORO_MODEL_URL, model_path)
    if not voices_path.exists():
        print("[MotionWorker] Downloading Kokoro voice pack...")
        urllib.request.urlretrieve(KOKORO_VOICES_URL, voices_path)
    return model_path, voices_path


def get_audio_duration(path: Path) -> float:
    out = subprocess.check_output(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        text=True,
    ).strip()
    return max(1.5, float(out))


def format_vtt_ts(seconds: float) -> str:
    hrs = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    secs = seconds % 60
    return f"{hrs:02d}:{mins:02d}:{secs:06.3f}"


def synthesize_scene_audio(text: str, out_wav: Path, voice: str) -> float:
    try:
        import soundfile as sf
        from kokoro_onnx import Kokoro

        model_path, voices_path = ensure_kokoro_weights()
        kokoro = Kokoro(str(model_path), str(voices_path))
        lang = "en-gb" if voice.startswith("b") else "en-us"
        samples, sr = kokoro.create(text, voice=voice, speed=1.04, lang=lang)
        sf.write(str(out_wav), samples, sr)
        return len(samples) / float(sr)
    except Exception as kokoro_err:
        print(f"[MotionWorker] Kokoro fallback ({kokoro_err}), trying edge-tts/gTTS...")
        tmp_mp3 = out_wav.with_suffix(".mp3")
        try:
            import edge_tts

            asyncio.run(
                edge_tts.Communicate(text, voice="en-US-AndrewNeural").save(str(tmp_mp3))
            )
        except Exception:
            from gtts import gTTS

            gTTS(text=text, lang="en").save(str(tmp_mp3))

        subprocess.run(
            ["ffmpeg", "-y", "-i", str(tmp_mp3), "-ar", "24000", "-ac", "1", str(out_wav)],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return get_audio_duration(out_wav)


def render_storyboard_to_mp4(
    storyboard: list[dict[str, Any]],
    course_title: str,
    output_mp4: Path,
    output_vtt: Path,
    voice: str = "am_michael",
    quality: str = "m",
) -> None:
    if not storyboard:
        raise ValueError("Storyboard is empty.")

    with tempfile.TemporaryDirectory() as tmp:
        work_dir = Path(tmp)
        audio_dir = work_dir / "audio"
        audio_dir.mkdir(exist_ok=True)

        manifest_scenes = []
        vtt_lines = ["WEBVTT", ""]
        cursor = 0.0

        for idx, sc in enumerate(storyboard, start=1):
            narration = str(sc.get("narration") or "").strip()
            if not narration:
                narration = str(sc.get("heading") or f"Scene {idx}")
            wav_path = audio_dir / f"scene_{idx}.wav"
            dur = synthesize_scene_audio(narration, wav_path, voice)

            manifest_scenes.append(
                {
                    "sceneNumber": idx,
                    "template": sc.get("template"),
                    "heading": sc.get("heading") or f"Part {idx}",
                    "subtitle": sc.get("subtitle") or "",
                    "bullets": sc.get("bullets") or [],
                    "codeSnippet": sc.get("codeSnippet"),
                    "narration": narration,
                    "audioPath": wav_path.as_posix(),
                    "durationSec": dur,
                }
            )

            vtt_lines.append(
                f"{format_vtt_ts(cursor)} --> {format_vtt_ts(cursor + dur)}"
            )
            vtt_lines.append(narration)
            vtt_lines.append("")
            cursor += dur + (0.75 if idx < len(storyboard) else 0.4)

        (work_dir / "scene_manifest.json").write_text(
            json.dumps({"courseTitle": course_title, "scenes": manifest_scenes}, indent=2),
            encoding="utf-8",
        )
        (work_dir / "lesson_scene.py").write_text(MANIM_SCENE_TEMPLATE, encoding="utf-8")

        q_flag = {"l": "-ql", "m": "-qm", "h": "-qh"}.get(quality, "-qm")
        cmd = [
            sys.executable,
            "-m",
            "manim",
            q_flag,
            "lesson_scene.py",
            "AcademyMotionLesson",
            "-o",
            "rendered.mp4",
        ]
        print(f"[MotionWorker] Running Manim ({q_flag}) for {len(storyboard)} scenes...")
        subprocess.run(cmd, cwd=str(work_dir), check=True)

        mp4_matches = list((work_dir / "media").rglob("rendered.mp4"))
        if not mp4_matches:
            raise RuntimeError("Manim finished but rendered.mp4 was not found.")

        output_mp4.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(mp4_matches[0], output_mp4)
        output_vtt.write_text("\n".join(vtt_lines), encoding="utf-8")
        print(f"[MotionWorker] Done! Saved {output_mp4} + {output_vtt}")


def run_server_mode(
    server_url: str,
    voice: str,
    quality: str,
    worker_key: str | None,
    watch: bool = False,
    poll_interval: int = 10,
) -> None:
    base = server_url.rstrip("/")
    headers = {"x-worker-key": worker_key} if worker_key else {}

    while True:
        try:
            resp = requests.get(
                f"{base}/api/worker/jobs?queued=true", headers=headers, timeout=30
            )
            resp.raise_for_status()
            jobs = resp.json().get("jobs", [])
        except Exception as poll_err:
            print(f"[MotionWorker] Poll warning: {poll_err}")
            if not watch:
                raise
            time.sleep(poll_interval)
            continue

        if not jobs:
            if not watch:
                print("[MotionWorker] No queued lessons found.")
                return
            print(f"[MotionWorker] Waiting for queued lessons... (checking every {poll_interval}s)")
            time.sleep(poll_interval)
            continue

        for job in jobs:
            lesson_id = job["lessonId"]
            title = job.get("lessonTitle", lesson_id)
            course_title = job.get("courseTitle", "OpenAcademy")
            storyboard = job.get("videoStoryboard", [])
            print(f"\n[MotionWorker] Rendering: {title}")

            requests.post(
                f"{base}/api/worker/jobs/{lesson_id}/status",
                json={"status": "processing"},
                headers=headers,
                timeout=20,
            )
            try:
                with tempfile.TemporaryDirectory() as out_tmp:
                    mp4_path = Path(out_tmp) / f"{lesson_id}.mp4"
                    vtt_path = Path(out_tmp) / f"{lesson_id}.vtt"
                    render_storyboard_to_mp4(
                        storyboard=storyboard,
                        course_title=course_title,
                        output_mp4=mp4_path,
                        output_vtt=vtt_path,
                        voice=voice,
                        quality=quality,
                    )
                    with mp4_path.open("rb") as vf, vtt_path.open("rb") as sf:
                        up = requests.post(
                            f"{base}/api/worker/jobs/{lesson_id}/upload",
                            headers=headers,
                            files={
                                "video": (f"{lesson_id}.mp4", vf, "video/mp4"),
                                "subtitles": (f"{lesson_id}.vtt", sf, "text/vtt"),
                            },
                            timeout=180,
                        )
                        up.raise_for_status()
                    print(f"[MotionWorker] Published motion video for: {title}")
            except Exception as exc:
                print(f"[MotionWorker] Failed {lesson_id}: {exc}")
                requests.post(
                    f"{base}/api/worker/jobs/{lesson_id}/status",
                    json={"status": "failed", "error": str(exc)},
                    headers=headers,
                    timeout=20,
                )

        if not watch:
            return


def main() -> None:
    parser = argparse.ArgumentParser(description="OpenAcademy Motion Graphics Renderer")
    parser.add_argument("--storyboard-json", type=Path, help="Lesson storyboard JSON file")
    parser.add_argument("--output", type=Path, default=Path("lesson_motion.mp4"))
    parser.add_argument("--voice", default="am_michael", help="Kokoro voice (am_michael, af_heart, af_bella, bm_george, bf_emma)")
    parser.add_argument("--quality", choices=["l", "m", "h"], default="m", help="l=480p, m=720p30 (fast), h=1080p60")
    parser.add_argument("--server-url", type=str, help="Live mode: OpenAcademy server URL")
    parser.add_argument("--watch", action="store_true", help="Continuously poll for newly queued lessons")
    parser.add_argument("--worker-key", type=str, default=os.environ.get("WORKER_API_KEY"))
    args = parser.parse_args()

    if args.server_url:
        run_server_mode(args.server_url, args.voice, args.quality, args.worker_key, watch=args.watch)
    elif args.storyboard_json:
        data = json.loads(args.storyboard_json.read_text(encoding="utf-8"))
        storyboard = data.get("videoStoryboard", data if isinstance(data, list) else [])
        course_title = data.get("courseTitle", "OpenAcademy")
        render_storyboard_to_mp4(
            storyboard=storyboard,
            course_title=course_title,
            output_mp4=args.output,
            output_vtt=args.output.with_suffix(".vtt"),
            voice=args.voice,
            quality=args.quality,
        )
    else:
        parser.error("Provide --storyboard-json or --server-url.")


if __name__ == "__main__":
    main()
