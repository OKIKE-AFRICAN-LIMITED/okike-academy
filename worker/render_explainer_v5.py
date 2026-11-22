#!/usr/bin/env python3
"""
Okike Studio Explainer Engine v5 (Auto-Sync Colab Worker)
=========================================================
- Per-scene Kokoro-82M studio voiceover (exact audio-to-visual sync, zero drift)
- Dual Okike 3D Hosts:
    * okike-v5-female -> host_1.mp4 + af_heart (Amara)
    * okike-v5-male   -> host_2.mp4 + am_michael (Tunde)
- Fast ByteDance LatentSync (--inference_steps 10) ONLY on intro & recap host clips (~4x faster!)
- Whisper word-level timestamps for millisecond-accurate kinetic captions + .vtt subtitles
- Subtle procedural transition whoosh SFX + warm studio ambient bed
- Remotion v5 TransitionSeries (smooth slide/fade transitions + 8 modular explainer templates)
"""

import argparse
import json
import os
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any

import numpy as np
import requests
import soundfile as sf
from kokoro_onnx import Kokoro

FPS = 30
TRANSITION_FRAMES = 12


def format_vtt_ts(seconds: float) -> str:
    hrs = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    secs = seconds % 60
    return f"{hrs:02d}:{mins:02d}:{secs:06.3f}"


def make_whoosh(sr: int, dur: float = 0.22) -> np.ndarray:
    n = int(sr * dur)
    t = np.linspace(0, dur, n, endpoint=False)
    noise = np.random.default_rng(7).normal(0, 1, n)
    env = np.sin(np.pi * t / dur) ** 2
    # Simple low-pass smoothing for a soft studio whoosh
    kernel = np.ones(18) / 18.0
    smooth = np.convolve(noise, kernel, mode="same")
    return (smooth * env * 0.12).astype(np.float32)


def extract_whisper_words(wav_path: Path, fallback_text: str, total_dur: float) -> list[dict[str, Any]]:
    try:
        import whisper

        model = whisper.load_model("tiny")
        result = model.transcribe(str(wav_path), word_timestamps=True, language="en")
        words = []
        for seg in result.get("segments", []):
            for w in seg.get("words", []):
                token = str(w.get("word", "")).strip()
                if not token:
                    continue
                words.append(
                    {
                        "word": token,
                        "startFrame": int(float(w["start"]) * FPS),
                        "endFrame": max(
                            int(float(w["start"]) * FPS) + 2,
                            int(float(w["end"]) * FPS),
                        ),
                    }
                )
        if words:
            return words
    except Exception as exc:
        print(f"[OkikeV5] Whisper word sync skipped ({exc}); using proportional timing.")

    tokens = fallback_text.split()
    fpw = (total_dur * FPS) / max(1, len(tokens))
    return [
        {"word": w, "startFrame": int(i * fpw), "endFrame": int((i + 1) * fpw)}
        for i, w in enumerate(tokens)
    ]


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


def render_lesson_v5(
    job: dict[str, Any],
    kokoro: Kokoro,
    remotion_dir: Path,
    latentsync_dir: Path,
    host_female: Path,
    host_male: Path,
    out_mp4: Path,
    out_vtt: Path,
) -> None:
    video_model = str(job.get("videoModel") or "okike-v5-female")
    is_male = "male" in video_model and "female" not in video_model
    voice = "am_michael" if is_male else "af_heart"
    host_name = "Tunde • Okike Host" if is_male else "Amara • Okike Host"
    base_host = host_male if (is_male and host_male.exists()) else host_female

    storyboard = job.get("videoStoryboard") or []
    if not storyboard:
        raise ValueError("Empty videoStoryboard")

    public_dir = remotion_dir / "public"
    public_dir.mkdir(exist_ok=True)

    # 1. Per-scene Kokoro-82M audio synthesis -> exact scene durations!
    scene_audios: list[np.ndarray] = []
    scene_wavs: list[Path] = []
    scenes_spec: list[dict[str, Any]] = []
    vtt_lines = ["WEBVTT", ""]
    all_text_parts: list[str] = []
    sr = 24000

    with tempfile.TemporaryDirectory() as tmp:
        tdir = Path(tmp)
        cursor_sec = 0.0
        for idx, sc in enumerate(storyboard):
            narration = str(sc.get("narration") or sc.get("heading") or f"Part {idx + 1}").strip()
            all_text_parts.append(narration)
            samples, sr = kokoro.create(narration, voice=voice, speed=1.05, lang="en-us")
            # Add a crisp 0.25s breath pad after each scene
            breath = np.zeros(int(sr * 0.25), dtype=np.float32)
            padded = np.concatenate([samples.astype(np.float32), breath])
            dur_sec = len(padded) / float(sr)

            wpath = tdir / f"scene_{idx}.wav"
            sf.write(str(wpath), padded, sr)
            scene_wavs.append(wpath)
            scene_audios.append(padded)

            # Compensate for TransitionSeries overlap so speech never gets cut off
            overlap_pad = TRANSITION_FRAMES if idx < len(storyboard) - 1 else 6
            frames = max(60, int(round(dur_sec * FPS)) + overlap_pad)

            scenes_spec.append(
                {
                    "template": sc.get("template") or ("host_intro" if idx == 0 else "host_recap" if idx == len(storyboard) - 1 else "framework_triad"),
                    "heading": sc.get("heading") or job.get("lessonTitle") or f"Part {idx + 1}",
                    "subtitle": sc.get("subtitle") or "",
                    "bullets": sc.get("bullets") or [],
                    "codeSnippet": sc.get("codeSnippet"),
                    "defenseLabel": sc.get("defenseLabel"),
                    "stats": sc.get("stats"),
                    "durationInFrames": frames,
                }
            )

            vtt_lines.append(f"{format_vtt_ts(cursor_sec)} --> {format_vtt_ts(cursor_sec + dur_sec)}")
            vtt_lines.append(narration)
            vtt_lines.append("")
            cursor_sec += dur_sec

        # 2. Mix voice + subtle transition whoosh SFX + warm studio ambient bed
        full_voice = np.concatenate(scene_audios)
        full_voice_wav = tdir / "full_voice.wav"
        sf.write(str(full_voice_wav), full_voice, sr)

        total_dur = len(full_voice) / float(sr)
        t = np.linspace(0, total_dur, len(full_voice), endpoint=False)
        bed = (
            0.30 * np.sin(2 * np.pi * 98.0 * t)
            + 0.20 * np.sin(2 * np.pi * 146.83 * t)
            + 0.15 * np.sin(2 * np.pi * 196.0 * t)
        ).astype(np.float32) * 0.028

        mix = full_voice + bed
        whoosh = make_whoosh(sr)
        offset = 0
        for idx, arr in enumerate(scene_audios[:-1]):
            offset += len(arr)
            start = max(0, offset - len(whoosh) // 2)
            end = min(len(mix), start + len(whoosh))
            mix[start:end] += whoosh[: end - start]

        mix = np.clip(mix, -0.98, 0.98)
        sf.write(str(public_dir / "lesson_mix.wav"), mix, sr)

        # 3. Exact Whisper word timestamps for kinetic captions
        caption_words = extract_whisper_words(
            full_voice_wav, " ".join(all_text_parts), total_dur
        )

        # 4. Fast LatentSync (10 steps) ONLY on Intro (scene 0) & Recap (last scene)!
        intro_out = public_dir / "intro_host.mp4"
        recap_out = public_dir / "recap_host.mp4"
        print(f"[OkikeV5] Lip-syncing {host_name} for Intro & Recap (10 steps)...")
        lipsync_clip(latentsync_dir, base_host, scene_wavs[0], intro_out, steps=10)
        if len(scene_wavs) > 1:
            lipsync_clip(latentsync_dir, base_host, scene_wavs[-1], recap_out, steps=10)
        else:
            recap_out.write_bytes(intro_out.read_bytes())

    # 5. Calculate exact TransitionSeries total frame count & render Remotion v5!
    n_transitions = max(0, len(scenes_spec) - 1)
    total_frames = sum(s["durationInFrames"] for s in scenes_spec) - (
        n_transitions * TRANSITION_FRAMES
    )

    props = {
        "courseTitle": str(job.get("courseTitle") or "OKIKE ACADEMY")[:34].upper(),
        "hostName": host_name,
        "durationInFrames": max(90, total_frames),
        "audioFile": "lesson_mix.wav",
        "introHostVideo": "intro_host.mp4",
        "recapHostVideo": "recap_host.mp4",
        "captionWords": caption_words,
        "scenes": scenes_spec,
    }
    props_path = remotion_dir / "v5_props.json"
    props_path.write_text(json.dumps(props, indent=2), encoding="utf-8")

    print(f"[OkikeV5] Rendering Remotion v5 ({total_frames} frames @ {FPS}fps)...")
    subprocess.run(
        [
            "npx", "remotion", "render", "src/index.ts", "OkikeLesson",
            str(out_mp4.resolve()), "--props=./v5_props.json", "--codec=h264", "--gl=angle",
        ],
        cwd=str(remotion_dir),
        check=True,
    )
    out_vtt.write_text("\n".join(vtt_lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Okike Studio v5 Auto-Sync Colab Worker")
    parser.add_argument("--server-url", required=True)
    parser.add_argument("--watch", action="store_true")
    parser.add_argument("--poll-interval", type=int, default=10)
    parser.add_argument("--worker-key", default=os.environ.get("WORKER_API_KEY"))
    args = parser.parse_args()

    base = args.server_url.rstrip("/")
    headers = {"x-worker-key": args.worker_key} if args.worker_key else {}

    kokoro = Kokoro("kokoro-v1.0.onnx", "voices-v1.0.bin")
    remotion_dir = Path("remotion_studio")
    latentsync_dir = Path("LatentSync")
    host_female = Path("host_1.mp4")
    host_male = Path("host_2.mp4")

    while True:
        try:
            resp = requests.get(f"{base}/api/worker/jobs?queued=true", headers=headers, timeout=30)
            resp.raise_for_status()
            jobs = resp.json().get("jobs", [])
        except Exception as err:
            print(f"[OkikeV5] Poll warning: {err}")
            if not args.watch:
                raise
            time.sleep(args.poll_interval)
            continue

        if not jobs:
            if not args.watch:
                print("[OkikeV5] No queued lessons.")
                return
            print(f"[OkikeV5] Idle — waiting for queued lessons ({args.poll_interval}s)...")
            time.sleep(args.poll_interval)
            continue

        for job in jobs:
            lesson_id = job["lessonId"]
            title = job.get("lessonTitle", lesson_id)
            print(f"\n[OkikeV5] === Rendering Lesson: {title} ===")
            requests.post(
                f"{base}/api/worker/jobs/{lesson_id}/status",
                json={"status": "processing"},
                headers=headers,
                timeout=20,
            )
            try:
                with tempfile.TemporaryDirectory() as out_tmp:
                    mp4 = Path(out_tmp) / f"{lesson_id}.mp4"
                    vtt = Path(out_tmp) / f"{lesson_id}.vtt"
                    render_lesson_v5(
                        job, kokoro, remotion_dir, latentsync_dir, host_female, host_male, mp4, vtt
                    )
                    with mp4.open("rb") as vf, vtt.open("rb") as sf:
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
                print(f"[OkikeV5] Published v5 explainer video for: {title}")
            except Exception as exc:
                print(f"[OkikeV5] Failed {lesson_id}: {exc}")
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
