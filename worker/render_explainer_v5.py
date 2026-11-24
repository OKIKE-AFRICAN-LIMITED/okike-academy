#!/usr/bin/env python3
"""
Okike Studio Institutional Auto-Sync Colab Worker (All Courses)
===============================================================
Automatically pulls queued lessons from https://academy.okikeenterprises.com
and runs the full 7-Stage Institutional Pipeline for EVERY course:
  1. Stage 1 (Lesson Planner) + Stage 2 (Plan Critic, max 2 revision loops)
  2. Stage 3 (Scene Director + Hard Variety/Accuracy Validators)
  3. Stage 4 (Real HTML/CSS UI Mockups / Code Previews + licenses.json)
  4. Stage 5 (Kokoro-82M + Pronunciation Dict + -16 LUFS + VTT/SRT/Transcript)
  5. Stage 6 (1080p Non-Overlapping Remotion Render + Fast 10-Step LatentSync)
  6. Stage 7 (Automated QA Gate -> Auto-Upload to Cloudinary via Okike Academy API)

Tracks previous scene sequences per course so NO two lessons in any course
ever repeat the same scene sequence.
"""

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any

import requests
from kokoro_onnx import Kokoro

from pipeline.llm_client import unload_local_llm
from pipeline.stage4_assets import run_stage4_assets
from pipeline.stage5_narration import run_stage5_narration
from pipeline.stage7_qa import run_stage7_qa_gate
from pipeline.stages_1_to_3 import plan_with_critic_loop, run_stage3_director

FPS = 30


def upload_direct_to_cloudinary(file_path: Path, public_id: str, is_video: bool) -> str | None:
    cloud = os.environ.get("CLOUDINARY_CLOUD_NAME", "").strip()
    api_key = os.environ.get("CLOUDINARY_API_KEY", "").strip()
    api_secret = os.environ.get("CLOUDINARY_API_SECRET", "").strip()
    if not (cloud and api_key and api_secret):
        return None

    resource_type = "video" if is_video else "raw"
    folder = "okike-academy"
    timestamp = str(int(time.time()))
    to_sign = f"folder={folder}&overwrite=true&public_id={public_id}&timestamp={timestamp}{api_secret}"
    sig = hashlib.sha1(to_sign.encode("utf-8")).hexdigest()

    with file_path.open("rb") as fh:
        resp = requests.post(
            f"https://api.cloudinary.com/v1_1/{cloud}/{resource_type}/upload",
            data={
                "api_key": api_key,
                "timestamp": timestamp,
                "folder": folder,
                "public_id": public_id,
                "overwrite": "true",
                "signature": sig,
            },
            files={"file": (file_path.name, fh)},
            timeout=300,
        )
    data = resp.json()
    if not resp.ok or not data.get("secure_url"):
        raise RuntimeError(f"Direct Cloudinary upload failed: {data}")
    return str(data["secure_url"])


def lipsync_clip(
    latentsync_dir: Path,
    base_host_mp4: Path,
    scene_wav: Path,
    out_mp4: Path,
    steps: int = 10,
) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        tdir = Path(tmp)
        wav16 = tdir / "a16.wav"
        loop25 = tdir / "loop25.mp4"
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(scene_wav), "-ar", "16000", "-ac", "1", str(wav16)],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        dur = float(
            subprocess.check_output(
                [
                    "ffprobe", "-v", "error", "-show_entries", "format=duration",
                    "-of", "default=noprint_wrappers=1:nokey=1", str(wav16),
                ],
                text=True,
            ).strip()
        )
        subprocess.run(
            [
                "ffmpeg", "-y", "-stream_loop", "-1", "-i", str(base_host_mp4),
                "-t", f"{dur + 0.25:.2f}", "-r", "25", "-an",
                "-vf", "scale=512:512:force_original_aspect_ratio=increase,crop=512:512",
                "-c:v", "libx264", "-preset", "fast", str(loop25),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        subprocess.run(
            [
                "python", "-m", "scripts.inference",
                "--unet_config_path", "configs/unet/stage2.yaml",
                "--inference_ckpt_path", "checkpoints/latentsync_unet.pt",
                "--video_path", str(loop25),
                "--audio_path", str(wav16),
                "--video_out_path", str(out_mp4.resolve()),
                "--guidance_scale", "1.5",
                "--inference_steps", str(steps),
                "--seed", "42",
            ],
            cwd=str(latentsync_dir),
            check=True,
        )


def convert_directed_scenes_to_remotion(
    scenes: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    out = []
    for sc in scenes:
        spec = sc.get("visual_spec") or {}
        st = sc.get("scene_type", "key_term_callout")
        bullets: list[str] = []
        if st == "pause_and_predict":
            bullets = [str(spec.get("answer") or "Review the key concept.")]
        elif isinstance(spec.get("steps"), list):
            bullets = [str(x) for x in spec["steps"]]
        elif isinstance(spec.get("points"), list):
            bullets = [str(x) for x in spec["points"]]
        elif isinstance(spec.get("bullets"), list):
            bullets = [str(x) for x in spec["bullets"]]
        elif spec.get("definition"):
            bullets = [str(spec["definition"])]
            if spec.get("example"):
                bullets.append(f"Example: {spec['example']}")

        out.append(
            {
                "template": st,
                "heading": sc.get("on_screen_text") or "Lesson",
                "subtitle": str(spec.get("question") or spec.get("subtitle") or ""),
                "bullets": bullets,
                "codeSnippet": spec.get("code"),
                "stats": spec.get("stats"),
                "sourceCitation": sc.get("source_citation") or "",
                "resolvedAssets": sc.get("resolved_assets") or {},
                "durationInFrames": int(sc.get("durationInFrames") or 120),
            }
        )
    return out


def render_lesson_institutional(
    job: dict[str, Any],
    remotion_dir: Path,
    latentsync_dir: Path,
    host_female: Path,
    host_male: Path,
    work_root: Path,
    course_sequences: dict[str, list[list[str]]],
    out_mp4: Path,
    out_vtt: Path,
    render_portrait: bool = False,
) -> dict[str, Any]:
    course_id = str(job.get("courseId") or "default")
    course_title = str(job.get("courseTitle") or "Okike Academy")
    module_title = str(job.get("moduleTitle") or "Module 1")
    lesson_title = str(job.get("lessonTitle") or "Lesson")
    video_model = str(job.get("videoModel") or "okike-v5-female")

    is_male = "male" in video_model and "female" not in video_model
    voice = "am_michael" if is_male else "af_heart"
    host_name = "Tunde • Okike Host" if is_male else "Amara • Okike Host"
    base_host = host_male if (is_male and host_male.exists()) else host_female

    prev_seqs = course_sequences.setdefault(course_id, [])
    lesson_dir = work_root / str(job["lessonId"])
    lesson_dir.mkdir(parents=True, exist_ok=True)

    # Stages 1, 2 & 3: Planner -> Critic -> Scene Director (with hard variety validation)
    print(f"[Institutional] Stage 1-2 Planner & Critic for: {lesson_title}")
    plan, critic_report = plan_with_critic_loop(
        course_title=course_title,
        module_title=module_title,
        lesson_title=lesson_title,
        level="Beginner",
        previous_sequences=prev_seqs,
    )
    print(f"[Institutional] Stage 3 Scene Director (Critic passed={critic_report['passed']})...")
    scenes = run_stage3_director(plan, previous_sequences=prev_seqs)
    # Free local HuggingFace LLM VRAM before Stage 4 (FLUX + Wan2.2) loads!
    unload_local_llm()

    # Stage 4: HTML/CSS UI Mockups, Code Previews & licenses.json
    assets_dir = lesson_dir / "assets"
    print("[Institutional] Stage 4 Asset Generator + licenses.json...")
    scenes, licenses = run_stage4_assets(scenes, assets_dir)

    # Stage 5: Per-scene Kokoro-82M + Pronunciation Dict + -16 LUFS + VTT/SRT/Transcript
    audio_dir = lesson_dir / "audio"
    print("[Institutional] Stage 5 Narration, -16 LUFS & Accessibility outputs...")
    timing = run_stage5_narration(
        scenes=scenes,
        audio_dir=audio_dir,
        voice=voice,
        licenses=licenses,
    )

    # Stage 7: Automated QA Gate BEFORE rendering/publishing
    print("[Institutional] Stage 7 Automated QA Gate...")
    qa = run_stage7_qa_gate(
        plan=plan,
        scenes=timing["scenes"],
        timing_bundle=timing,
        licenses=licenses,
        previous_sequences=prev_seqs,
    )
    if not qa["passed"]:
        raise RuntimeError(f"QA Gate blocked publish: {qa['failures']}")

    # Stage 6: Copy assets + audio into Remotion public/ & lip-sync ONLY intro & recap
    public_dir = remotion_dir / "public"
    public_dir.mkdir(exist_ok=True)
    shutil.copy2(timing["master_audio_path"], public_dir / "lesson_mix.wav")
    for asset_file in list(assets_dir.glob("*.png")) + list(assets_dir.glob("*.mp4")):
        shutil.copy2(asset_file, public_dir / asset_file.name)

    intro_out = public_dir / "intro_host.mp4"
    recap_out = public_dir / "recap_host.mp4"
    print(f"[Institutional] Fast 10-step LatentSync on Intro & Recap ({host_name})...")
    lipsync_clip(latentsync_dir, base_host, Path(timing["scenes"][0]["audio_path"]), intro_out, steps=10)
    lipsync_clip(latentsync_dir, base_host, Path(timing["scenes"][-1]["audio_path"]), recap_out, steps=10)

    remotion_scenes = convert_directed_scenes_to_remotion(timing["scenes"])
    total_frames = sum(int(s["durationInFrames"]) for s in remotion_scenes)
    props = {
        "courseTitle": course_title[:34].upper(),
        "hostName": host_name,
        "durationInFrames": max(90, total_frames),
        "audioFile": "lesson_mix.wav",
        "introHostVideo": "intro_host.mp4",
        "recapHostVideo": "recap_host.mp4",
        "captionWords": timing["caption_words"],
        "scenes": remotion_scenes,
    }
    (remotion_dir / "v6_props.json").write_text(json.dumps(props, indent=2), encoding="utf-8")

    # Render 1080p Landscape Master (zero title ghosting!)
    print(f"[Institutional] Stage 6 Rendering 1080p Landscape ({total_frames} frames)...")
    subprocess.run(
        [
            "npx", "remotion", "render", "src/index.ts", "OkikeLesson",
            str(out_mp4.resolve()), "--props=./v6_props.json", "--codec=h264", "--gl=angle",
        ],
        cwd=str(remotion_dir),
        check=True,
    )

    portrait_mp4: Path | None = None
    if render_portrait:
        portrait_mp4 = out_mp4.with_name(out_mp4.stem + "_portrait_9x16.mp4")
        print("[Institutional] Stage 6 Rendering 1080p Portrait (9:16)...")
        subprocess.run(
            [
                "npx", "remotion", "render", "src/index.ts", "OkikeLessonPortrait",
                str(portrait_mp4.resolve()), "--props=./v6_props.json", "--codec=h264", "--gl=angle",
            ],
            cwd=str(remotion_dir),
            check=True,
        )

    shutil.copy2(timing["vtt_path"], out_vtt)
    # Record this lesson's scene sequence so the next lesson in the same course must differ
    prev_seqs.append(qa["scene_sequence"])
    return {
        "qa": qa,
        "licenses": licenses,
        "transcript_text": timing.get("transcript_text") or "",
        "portrait_mp4": str(portrait_mp4) if (portrait_mp4 and portrait_mp4.exists()) else None,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Okike Institutional Auto-Sync Worker (All Courses)")
    parser.add_argument("--server-url", default="https://academy.okikeenterprises.com")
    parser.add_argument("--watch", action="store_true")
    parser.add_argument("--portrait", action="store_true", help="Also render native 9:16 mobile portrait variant")
    parser.add_argument("--poll-interval", type=int, default=10)
    parser.add_argument("--worker-key", default=os.environ.get("WORKER_API_KEY"))
    args = parser.parse_args()

    base = args.server_url.rstrip("/")
    headers = {"x-worker-key": args.worker_key} if args.worker_key else {}

    remotion_dir = Path("remotion_studio")
    latentsync_dir = Path("LatentSync")
    host_female = Path("host_1.mp4")
    host_male = Path("host_2.mp4")
    work_root = Path("pipeline_cache")
    course_sequences: dict[str, list[list[str]]] = {}

    while True:
        try:
            resp = requests.get(f"{base}/api/worker/jobs?queued=true", headers=headers, timeout=30)
            resp.raise_for_status()
            jobs = resp.json().get("jobs", [])
        except Exception as err:
            print(f"[Institutional] Poll warning: {err}")
            if not args.watch:
                raise
            time.sleep(args.poll_interval)
            continue

        if not jobs:
            if not args.watch:
                print("[Institutional] No queued lessons.")
                return
            print(f"[Institutional] Idle — waiting for queued lessons ({args.poll_interval}s)...")
            time.sleep(args.poll_interval)
            continue

        for job in jobs:
            lesson_id = job["lessonId"]
            title = job.get("lessonTitle", lesson_id)
            print(f"\n[Institutional] === Processing: {title} ===")
            requests.post(
                f"{base}/api/worker/jobs/{lesson_id}/status",
                json={"status": "processing"},
                headers=headers,
                timeout=20,
            )
            try:
                do_portrait = args.portrait or os.environ.get("OKIKE_RENDER_PORTRAIT", "0").strip() in ("1", "true", "yes")
                with tempfile.TemporaryDirectory() as out_tmp:
                    mp4 = Path(out_tmp) / f"{lesson_id}.mp4"
                    vtt = Path(out_tmp) / f"{lesson_id}.vtt"
                    bundle = render_lesson_institutional(
                        job, remotion_dir, latentsync_dir, host_female, host_male,
                        work_root, course_sequences, mp4, vtt, render_portrait=do_portrait,
                    )
                    # Upload directly to Cloudinary to bypass Vercel's 4.5MB serverless body limit!
                    cloud_video_url = upload_direct_to_cloudinary(mp4, lesson_id, is_video=True)
                    if cloud_video_url:
                        cloud_vtt_url = upload_direct_to_cloudinary(vtt, f"{lesson_id}_vtt", is_video=False)
                        cloud_portrait_url = None
                        if bundle.get("portrait_mp4"):
                            cloud_portrait_url = upload_direct_to_cloudinary(
                                Path(bundle["portrait_mp4"]), f"{lesson_id}_portrait", is_video=True
                            )
                        up = requests.post(
                            f"{base}/api/worker/jobs/{lesson_id}/upload",
                            headers=headers,
                            json={
                                "videoUrl": cloud_video_url,
                                "portraitVideoUrl": cloud_portrait_url,
                                "subtitleUrl": cloud_vtt_url,
                                "transcriptText": bundle.get("transcript_text") or "",
                                "licenses": bundle.get("licenses") or [],
                                "qaReport": bundle.get("qa") or None,
                            },
                            timeout=30,
                        )
                        up.raise_for_status()
                    else:
                        with mp4.open("rb") as vf, vtt.open("rb") as sf:
                            up = requests.post(
                                f"{base}/api/worker/jobs/{lesson_id}/upload",
                                headers=headers,
                                files={
                                    "video": (f"{lesson_id}.mp4", vf, "video/mp4"),
                                    "subtitles": (f"{lesson_id}.vtt", sf, "text/vtt"),
                                },
                                timeout=240,
                            )
                            up.raise_for_status()
                print(f"[Institutional] Published QA-passed 1080p video for: {title}")
            except Exception as exc:
                print(f"[Institutional] Failed {lesson_id}: {exc}")
                requests.post(
                    f"{base}/api/worker/jobs/{lesson_id}/status",
                    json={"status": "failed", "error": str(exc)},
                    headers=headers,
                    timeout=20,
                )

        if not args.watch:
            return


if __name__ == "__main__":
    main()
