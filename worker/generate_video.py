#!/usr/bin/env python3
"""
OpenAcademy Open-Source Video Worker ($0 Cost)
==============================================
Generates real AI educational scene videos using:
  - Lightricks/LTX-Video  (fast, fits on free Google Colab T4 16GB GPU)
  - Wan-AI/Wan2.1-T2V-1.3B-Diffusers (high-detail 1.3B open-source video model)
  - edge-tts (free Microsoft neural voiceover + subtitles)
  - ffmpeg (stitches scenes + voiceover + WebVTT captions into a single MP4)

Usage (Offline Mode - easiest with Colab):
  python generate_video.py --storyboard-json storyboard.json --output lesson.mp4 --model ltx-video

Usage (Live Server Mode - pulls queued jobs & auto-uploads MP4s):
  python generate_video.py --server-url https://your-app.vercel.app --model ltx-video
"""

import argparse
import asyncio
import json
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any

import edge_tts
import requests
import torch
from diffusers.utils import export_to_video


DEFAULT_VOICE = "en-US-AndrewNeural"


def get_media_duration(path: Path) -> float:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        str(path),
    ]
    out = subprocess.check_output(cmd, text=True).strip()
    return max(1.0, float(out))


async def synthesize_voiceover(text: str, audio_path: Path, voice: str) -> None:
    try:
        communicate = edge_tts.Communicate(text, voice=voice)
        await communicate.save(str(audio_path))
    except Exception as exc:
        print(f"[Worker] edge-tts unavailable ({exc}); falling back to gTTS...")
        from gtts import gTTS

        gTTS(text=text, lang="en", tld="com").save(str(audio_path))


def format_vtt_timestamp(seconds: float) -> str:
    hrs = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    secs = seconds % 60
    return f"{hrs:02d}:{mins:02d}:{secs:06.3f}"


def load_video_pipeline(model_name: str):
    if not torch.cuda.is_available():
        raise RuntimeError(
            "No CUDA GPU detected. Run this worker on a free Google Colab T4 GPU "
            "(Runtime -> Change runtime type -> T4 GPU) or a PC with an NVIDIA GPU."
        )

    dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16

    if model_name == "wan2.1":
        from diffusers import AutoencoderKLWan, WanPipeline

        model_id = "Wan-AI/Wan2.1-T2V-1.3B-Diffusers"
        print(f"[Worker] Loading Wan 2.1 ({model_id})...")
        vae = AutoencoderKLWan.from_pretrained(
            model_id, subfolder="vae", torch_dtype=torch.float32
        )
        pipe = WanPipeline.from_pretrained(model_id, vae=vae, torch_dtype=dtype)
        pipe.enable_model_cpu_offload()
        return pipe

    from diffusers import LTXPipeline
    from transformers import T5Tokenizer

    model_id = "Lightricks/LTX-Video"
    print(f"[Worker] Loading LTX-Video ({model_id})...")
    tokenizer = T5Tokenizer.from_pretrained(model_id, subfolder="tokenizer", use_fast=False)
    pipe = LTXPipeline.from_pretrained(model_id, tokenizer=tokenizer, dtype=dtype)
    pipe.enable_model_cpu_offload()
    pipe.vae.enable_tiling()
    return pipe


def render_scene_clip(
    pipe: Any,
    model_name: str,
    prompt: str,
    out_mp4: Path,
    seed: int = 42,
) -> None:
    negative_prompt = (
        "blurry, distorted, low quality, watermark, jittery, unreadable text, deformed"
    )
    generator = torch.Generator(device="cpu").manual_seed(seed)

    if model_name == "wan2.1":
        video_frames = pipe(
            prompt=prompt,
            negative_prompt=negative_prompt,
            height=480,
            width=832,
            num_frames=49,
            guidance_scale=5.0,
            num_inference_steps=30,
            generator=generator,
        ).frames[0]
        export_to_video(video_frames, str(out_mp4), fps=16)
    else:
        video_frames = pipe(
            prompt=prompt,
            negative_prompt=negative_prompt,
            width=704,
            height=480,
            num_frames=81,
            num_inference_steps=30,
            generator=generator,
        ).frames[0]
        export_to_video(video_frames, str(out_mp4), fps=24)


def mux_scene_with_audio(
    raw_video: Path, audio_mp3: Path, scene_out: Path, audio_duration: float
) -> None:
    # Loop video if shorter than narration, trim cleanly to narration + 0.35s breath
    target_dur = audio_duration + 0.35
    cmd = [
        "ffmpeg",
        "-y",
        "-stream_loop",
        "-1",
        "-i",
        str(raw_video),
        "-i",
        str(audio_mp3),
        "-t",
        f"{target_dur:.2f}",
        "-vf",
        "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "22",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-shortest",
        str(scene_out),
    ]
    subprocess.run(cmd, check=True)


def generate_lesson_video(
    pipe: Any,
    model_name: str,
    storyboard: list[dict[str, Any]],
    output_mp4: Path,
    output_vtt: Path,
    voice: str = DEFAULT_VOICE,
) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        scene_files: list[Path] = []
        vtt_lines = ["WEBVTT", ""]
        cursor = 0.0

        for idx, scene in enumerate(storyboard, start=1):
            narration = str(scene.get("narration", "")).strip()
            visual_prompt = str(scene.get("visualPrompt", "")).strip()
            print(f"[Worker] Scene {idx}/{len(storyboard)}: generating voiceover + AI clip...")

            audio_path = tmp_dir / f"scene_{idx}.mp3"
            asyncio.run(synthesize_voiceover(narration, audio_path, voice))
            audio_dur = get_media_duration(audio_path)

            raw_clip = tmp_dir / f"raw_{idx}.mp4"
            render_scene_clip(
                pipe=pipe,
                model_name=model_name,
                prompt=visual_prompt,
                out_mp4=raw_clip,
                seed=100 + idx,
            )

            muxed_clip = tmp_dir / f"scene_{idx}_final.mp4"
            mux_scene_with_audio(raw_clip, audio_path, muxed_clip, audio_dur)
            scene_files.append(muxed_clip)

            actual_dur = get_media_duration(muxed_clip)
            vtt_lines.append(
                f"{format_vtt_timestamp(cursor)} --> {format_vtt_timestamp(cursor + audio_dur)}"
            )
            vtt_lines.append(narration)
            vtt_lines.append("")
            cursor += actual_dur

        concat_list = tmp_dir / "concat.txt"
        concat_list.write_text(
            "\n".join(f"file '{p.as_posix()}'" for p in scene_files),
            encoding="utf-8",
        )

        output_mp4.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(concat_list),
                "-c",
                "copy",
                str(output_mp4),
            ],
            check=True,
        )
        output_vtt.write_text("\n".join(vtt_lines), encoding="utf-8")
        print(f"[Worker] Finished video: {output_mp4} (+ {output_vtt})")


def run_server_mode(
    server_url: str, model_name: str, voice: str, worker_key: str | None
) -> None:
    base = server_url.rstrip("/")
    headers = {"x-worker-key": worker_key} if worker_key else {}

    resp = requests.get(f"{base}/api/worker/jobs?queued=true", headers=headers, timeout=30)
    resp.raise_for_status()
    jobs = resp.json().get("jobs", [])

    if not jobs:
        print("[Worker] No queued lessons found. Queue a lesson in Video Studio first!")
        return

    print(f"[Worker] Found {len(jobs)} queued lesson(s).")
    pipe = load_video_pipeline(model_name)

    for job in jobs:
        lesson_id = job["lessonId"]
        title = job.get("lessonTitle", lesson_id)
        storyboard = job.get("videoStoryboard", [])
        print(f"\n[Worker] Processing lesson: {title} ({lesson_id})")

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
                generate_lesson_video(
                    pipe=pipe,
                    model_name=model_name,
                    storyboard=storyboard,
                    output_mp4=mp4_path,
                    output_vtt=vtt_path,
                    voice=voice,
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
                print(f"[Worker] Uploaded & published video for: {title}")
        except Exception as exc:
            print(f"[Worker] Failed lesson {lesson_id}: {exc}")
            requests.post(
                f"{base}/api/worker/jobs/{lesson_id}/status",
                json={"status": "failed", "error": str(exc)},
                headers=headers,
                timeout=20,
            )


def main() -> None:
    parser = argparse.ArgumentParser(description="OpenAcademy Open-Source Video Worker")
    parser.add_argument(
        "--model",
        choices=["ltx-video", "wan2.1"],
        default="ltx-video",
        help="Open-source video generation model",
    )
    parser.add_argument(
        "--voice",
        default=DEFAULT_VOICE,
        help="edge-tts voice name (e.g. en-US-AndrewNeural, en-GB-SoniaNeural)",
    )
    parser.add_argument(
        "--storyboard-json",
        type=Path,
        help="Offline mode: path to storyboard JSON downloaded from OpenAcademy",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("lesson_video.mp4"),
        help="Offline mode: output MP4 path",
    )
    parser.add_argument(
        "--server-url",
        type=str,
        help="Live mode: OpenAcademy base URL (e.g. https://your-app.vercel.app)",
    )
    parser.add_argument(
        "--worker-key",
        type=str,
        default=os.environ.get("WORKER_API_KEY"),
        help="Optional WORKER_API_KEY if configured on your server",
    )
    args = parser.parse_args()

    if args.server_url:
        run_server_mode(args.server_url, args.model, args.voice, args.worker_key)
    elif args.storyboard_json:
        data = json.loads(args.storyboard_json.read_text(encoding="utf-8"))
        storyboard = data.get("videoStoryboard", data if isinstance(data, list) else [])
        if not storyboard:
            raise ValueError("No videoStoryboard scenes found in JSON file.")
        pipe = load_video_pipeline(args.model)
        vtt_path = args.output.with_suffix(".vtt")
        generate_lesson_video(
            pipe=pipe,
            model_name=args.model,
            storyboard=storyboard,
            output_mp4=args.output,
            output_vtt=vtt_path,
            voice=args.voice,
        )
    else:
        parser.error("Provide either --storyboard-json (offline) or --server-url (live).")


if __name__ == "__main__":
    main()
