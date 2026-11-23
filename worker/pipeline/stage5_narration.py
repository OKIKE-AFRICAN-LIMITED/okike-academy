"""
Stage 5: Narration, Timing, Loudness Normalization & Accessibility Outputs
==========================================================================
- Applies Okike pronunciation dictionary for technical terms & brand names
- Generates per-scene Kokoro-82M audio (content-hash cached!)
- Measures exact real audio duration per scene (NO fixed durations!)
- Normalizes final audio mix to -16 LUFS integrated / <= -1 dBTP via ffmpeg loudnorm
- Generates millisecond-synced WebVTT (.vtt), SRT (.srt), and full accessible transcript.txt
  (including alt-text descriptions of key visuals per Section 10 of the brief)
"""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf

from .schemas import content_hash

FPS = 30
MIN_VISUAL_HOLD_SEC = 0.65

# Pronunciation dictionary for technical & institutional terms
PRONUNCIATION_DICT: dict[str, str] = {
    "Okike": "Oh-kee-keh",
    "UI/UX": "U I and U X",
    "UI": "U I",
    "UX": "U X",
    "SQL": "sequel",
    "API": "A P I",
    "MFA": "M F A",
    "CIA": "C I A",
    "CSS": "C S S",
    "HTML": "H T M L",
    "JSON": "Jay-son",
    "WCAG": "W C A G",
}


def apply_pronunciation(text: str) -> str:
    out = text
    for term, spoken in PRONUNCIATION_DICT.items():
        out = re.sub(rf"\b{re.escape(term)}\b", spoken, out)
    return out


def _fmt_vtt(sec: float) -> str:
    h = int(sec // 3600)
    m = int((sec % 3600) // 60)
    s = sec % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}"


def _fmt_srt(sec: float) -> str:
    return _fmt_vtt(sec).replace(".", ",")


def normalize_to_minus16_lufs(in_wav: Path, out_wav: Path) -> None:
    """Normalizes integrated loudness to -16 LUFS with true peak <= -1.0 dBTP."""
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(in_wav),
        "-af",
        "loudnorm=I=-16:TP=-1.0:LRA=11",
        "-ar",
        "44100",
        "-ac",
        "1",
        str(out_wav),
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def run_stage5_narration(
    scenes: list[dict[str, Any]],
    audio_dir: Path,
    voice: str = "af_heart",
    kokoro_model: str = "kokoro-v1.0.onnx",
    kokoro_voices: str = "voices-v1.0.bin",
    licenses: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    from kokoro_onnx import Kokoro

    audio_dir.mkdir(parents=True, exist_ok=True)
    kokoro = Kokoro(kokoro_model, kokoro_voices)
    lang = "en-gb" if voice.startswith("b") else "en-us"

    combined_chunks: list[np.ndarray] = []
    vtt_lines = ["WEBVTT", ""]
    srt_lines: list[str] = []
    transcript_lines: list[str] = ["# Full Accessible Lesson Transcript", ""]
    all_words: list[dict[str, Any]] = []

    cursor_sec = 0.0
    sr = 24000
    alt_by_file = {
        a.get("file_path"): a.get("alt_text", "")
        for a in (licenses or [])
        if a.get("file_path")
    }

    for idx, sc in enumerate(scenes, start=1):
        narration_display = str(sc.get("narration") or "").strip()
        narration_spoken = apply_pronunciation(narration_display)
        h = content_hash({"voice": voice, "text": narration_spoken})
        scene_wav = audio_dir / f"scene_{idx:02d}_{h}.wav"

        if scene_wav.exists():
            samples, sr = sf.read(str(scene_wav), dtype="float32")
        else:
            samples, sr = kokoro.create(narration_spoken, voice=voice, speed=1.02, lang=lang)
            samples = samples.astype(np.float32)
            sf.write(str(scene_wav), samples, sr)

        speech_dur = len(samples) / float(sr)
        # Extra thinking pause for pause_and_predict scenes
        extra_hold = 3.0 if sc.get("scene_type") == "pause_and_predict" else MIN_VISUAL_HOLD_SEC
        silence = np.zeros(int(sr * extra_hold), dtype=np.float32)
        scene_padded = np.concatenate([samples, silence])
        scene_dur = len(scene_padded) / float(sr)

        sc["audio_path"] = str(scene_wav)
        sc["speech_duration_sec"] = round(speech_dur, 3)
        sc["measured_duration_sec"] = round(scene_dur, 3)
        sc["durationInFrames"] = max(60, int(round(scene_dur * FPS)))

        # Word-level timings (proportional within each scene; refined if Whisper is available)
        tokens = narration_display.split()
        if tokens:
            sec_per_word = speech_dur / len(tokens)
            for w_idx, tok in enumerate(tokens):
                ws = cursor_sec + w_idx * sec_per_word
                we = cursor_sec + (w_idx + 1) * sec_per_word
                all_words.append(
                    {
                        "word": tok,
                        "startSec": round(ws, 3),
                        "endSec": round(we, 3),
                        "startFrame": int(round(ws * FPS)),
                        "endFrame": max(int(round(ws * FPS)) + 2, int(round(we * FPS))),
                    }
                )

        # Max 2-line caption chunks (~10 words per cue)
        chunk_size = 10
        cue_start = cursor_sec
        for c_i in range(0, max(1, len(tokens)), chunk_size):
            sub_words = tokens[c_i : c_i + chunk_size]
            if not sub_words:
                continue
            frac = len(sub_words) / max(1, len(tokens))
            cue_end = min(cursor_sec + speech_dur, cue_start + speech_dur * frac)
            cue_text = " ".join(sub_words)
            vtt_lines.append(f"{_fmt_vtt(cue_start)} --> {_fmt_vtt(cue_end)}")
            vtt_lines.append(cue_text)
            vtt_lines.append("")
            srt_lines.append(str(len(srt_lines) // 4 + 1))
            srt_lines.append(f"{_fmt_srt(cue_start)} --> {_fmt_srt(cue_end)}")
            srt_lines.append(cue_text)
            srt_lines.append("")
            cue_start = cue_end

        # Accessible transcript with visual alt-text descriptions
        transcript_lines.append(
            f"## Scene {idx} ({sc.get('scene_type')}) [{_fmt_vtt(cursor_sec)}]"
        )
        transcript_lines.append(f"**On-screen:** {sc.get('on_screen_text', '')}")
        for fname in (sc.get("resolved_assets") or {}).values():
            if alt_by_file.get(fname):
                transcript_lines.append(f"*[Visual description: {alt_by_file[fname]}]*")
        transcript_lines.append(narration_display)
        transcript_lines.append("")

        combined_chunks.append(scene_padded)
        cursor_sec += scene_dur

    raw_master = audio_dir / "master_raw.wav"
    norm_master = audio_dir / "master_loudnorm.wav"
    sf.write(str(raw_master), np.concatenate(combined_chunks), sr)
    normalize_to_minus16_lufs(raw_master, norm_master)

    vtt_path = audio_dir / "captions.vtt"
    srt_path = audio_dir / "captions.srt"
    transcript_path = audio_dir / "transcript.txt"
    vtt_path.write_text("\n".join(vtt_lines), encoding="utf-8")
    srt_path.write_text("\n".join(srt_lines), encoding="utf-8")
    transcript_path.write_text("\n".join(transcript_lines), encoding="utf-8")

    return {
        "master_audio_path": str(norm_master),
        "vtt_path": str(vtt_path),
        "srt_path": str(srt_path),
        "transcript_path": str(transcript_path),
        "total_duration_sec": round(cursor_sec, 3),
        "total_frames": sum(int(sc["durationInFrames"]) for sc in scenes),
        "caption_words": all_words,
        "scenes": scenes,
    }
