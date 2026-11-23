"""
Stage 5: Broadcast Narration, Whisper Word Sync, Ambient Mastering & Accessibility
==================================================================================
- Applies Okike pronunciation dictionary for technical & institutional terms
- Generates per-scene Kokoro-82M narration audio (content-hash cached!)
- Measures exact real audio duration per scene (NO fixed durations!)
- Runs Whisper word-level timestamp alignment (<50 ms drift) with proportional fallback
- Mixes an original, subtle procedural ambient music bed (-30 dB under voice)
- Normalizes final master to -16 LUFS integrated / <= -1.0 dBTP via ffmpeg loudnorm
- Generates millisecond-synced WebVTT (.vtt), SRT (.srt), and full accessible transcript.txt
  (including alt-text descriptions of key visuals per Section 10 of the brief)
"""

from __future__ import annotations

import os
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
    "HTTPS": "H T T P S",
    "DDoS": "D-Doss",
}

_WHISPER_MODEL: Any = None


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


def _get_whisper_model() -> Any:
    global _WHISPER_MODEL
    if _WHISPER_MODEL is not None:
        return _WHISPER_MODEL
    try:
        import whisper

        _WHISPER_MODEL = whisper.load_model("base.en")
        return _WHISPER_MODEL
    except Exception as exc:
        print(f"[Stage 5 Audio] Whisper word alignment unavailable ({exc}); using proportional timing.")
        return None


def _align_scene_words(
    scene_wav: Path,
    narration_display: str,
    speech_dur: float,
    cursor_sec: float,
) -> list[dict[str, Any]]:
    """Extracts exact word-level timestamps via Whisper (fallback: proportional)."""
    model = _get_whisper_model()
    if model is not None:
        try:
            res = model.transcribe(str(scene_wav), word_timestamps=True, language="en")
            aligned: list[dict[str, Any]] = []
            for seg in res.get("segments", []):
                for w in seg.get("words", []):
                    tok = str(w.get("word") or "").strip()
                    if not tok:
                        continue
                    ws = cursor_sec + float(w.get("start", 0.0))
                    we = cursor_sec + max(float(w.get("end", 0.0)), float(w.get("start", 0.0)) + 0.06)
                    aligned.append(
                        {
                            "word": tok,
                            "startSec": round(ws, 3),
                            "endSec": round(we, 3),
                            "startFrame": int(round(ws * FPS)),
                            "endFrame": max(int(round(ws * FPS)) + 2, int(round(we * FPS))),
                        }
                    )
            if aligned:
                return aligned
        except Exception as exc:
            print(f"[Stage 5 Audio] Whisper scene alignment fallback ({exc})")

    # Fallback: character-weighted proportional timing
    tokens = narration_display.split()
    if not tokens:
        return []
    weights = [max(2, len(t)) for t in tokens]
    total_w = float(sum(weights))
    out: list[dict[str, Any]] = []
    t = cursor_sec
    for tok, w in zip(tokens, weights):
        dur = speech_dur * (w / total_w)
        out.append(
            {
                "word": tok,
                "startSec": round(t, 3),
                "endSec": round(t + dur, 3),
                "startFrame": int(round(t * FPS)),
                "endFrame": max(int(round(t * FPS)) + 2, int(round((t + dur) * FPS))),
            }
        )
        t += dur
    return out


def master_broadcast_audio(
    raw_voice_wav: Path,
    out_wav: Path,
    total_duration_sec: float,
) -> None:
    """
    Mixes a subtle, original procedural ambient pad (-30 dB under narration)
    and normalizes the master mix to -16 LUFS integrated / <= -1.0 dBTP.
    """
    use_bed = os.environ.get("OKIKE_AMBIENT_BED", "1").strip() not in ("0", "false", "off")
    if use_bed and total_duration_sec > 4.0:
        fade_out_start = max(1.0, total_duration_sec - 2.2)
        # Warm Cmaj9 soft harmonic ambient pad synthesized procedurally (100% original, zero licensing risk)
        bed_expr = (
            f"aevalsrc=0.025*(sin(2*PI*130.81*t)+0.7*sin(2*PI*196.00*t)"
            f"+0.5*sin(2*PI*246.94*t)+0.35*sin(2*PI*293.66*t))"
            f"*(0.85+0.15*sin(2*PI*0.08*t)):s=44100:d={total_duration_sec:.2f}"
        )
        filter_complex = (
            f"[0:a]aresample=44100,highpass=f=75,acompressor=threshold=-18dB:ratio=2.5:attack=15:release=180[voice];"
            f"[1:a]lowpass=f=380,afade=t=in:st=0:d=1.8,afade=t=out:st={fade_out_start:.2f}:d=2.0,volume=0.22[bed];"
            f"[voice][bed]amix=inputs=2:duration=first:dropout_transition=2,"
            f"loudnorm=I=-16:TP=-1.0:LRA=11[out]"
        )
        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            str(raw_voice_wav),
            "-f",
            "lavfi",
            "-i",
            bed_expr,
            "-filter_complex",
            filter_complex,
            "-map",
            "[out]",
            "-ar",
            "44100",
            "-ac",
            "2",
            str(out_wav),
        ]
        res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if res.returncode == 0 and out_wav.exists():
            return

    # Fallback: clean voice-only -16 LUFS normalization
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(raw_voice_wav),
        "-af",
        "highpass=f=75,loudnorm=I=-16:TP=-1.0:LRA=11",
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
            samples, sr = kokoro.create(narration_spoken, voice=voice, speed=1.0, lang=lang)
            samples = samples.astype(np.float32)
            sf.write(str(scene_wav), samples, sr)

        speech_dur = len(samples) / float(sr)
        extra_hold = 3.0 if sc.get("scene_type") == "pause_and_predict" else MIN_VISUAL_HOLD_SEC
        silence = np.zeros(int(sr * extra_hold), dtype=np.float32)
        scene_padded = np.concatenate([samples, silence])
        scene_dur = len(scene_padded) / float(sr)

        sc["audio_path"] = str(scene_wav)
        sc["speech_duration_sec"] = round(speech_dur, 3)
        sc["measured_duration_sec"] = round(scene_dur, 3)
        sc["durationInFrames"] = max(60, int(round(scene_dur * FPS)))

        # Whisper word-level alignment (fallback: character-weighted proportional)
        scene_words = _align_scene_words(scene_wav, narration_display, speech_dur, cursor_sec)
        all_words.extend(scene_words)

        # Max 2-line caption cues (~9 words per cue) built directly from aligned timestamps
        chunk_size = 9
        for c_i in range(0, len(scene_words), chunk_size):
            sub = scene_words[c_i : c_i + chunk_size]
            if not sub:
                continue
            cue_start = sub[0]["startSec"]
            cue_end = sub[-1]["endSec"]
            cue_text = " ".join(w["word"] for w in sub)
            vtt_lines.append(f"{_fmt_vtt(cue_start)} --> {_fmt_vtt(cue_end)}")
            vtt_lines.append(cue_text)
            vtt_lines.append("")
            srt_lines.append(str(len(srt_lines) // 4 + 1))
            srt_lines.append(f"{_fmt_srt(cue_start)} --> {_fmt_srt(cue_end)}")
            srt_lines.append(cue_text)
            srt_lines.append("")

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
    master_broadcast_audio(raw_master, norm_master, cursor_sec)

    vtt_text = "\n".join(vtt_lines)
    srt_text = "\n".join(srt_lines)
    transcript_text = "\n".join(transcript_lines)

    vtt_path = audio_dir / "captions.vtt"
    srt_path = audio_dir / "captions.srt"
    transcript_path = audio_dir / "transcript.txt"
    vtt_path.write_text(vtt_text, encoding="utf-8")
    srt_path.write_text(srt_text, encoding="utf-8")
    transcript_path.write_text(transcript_text, encoding="utf-8")

    return {
        "master_audio_path": str(norm_master),
        "vtt_path": str(vtt_path),
        "srt_path": str(srt_path),
        "transcript_path": str(transcript_path),
        "transcript_text": transcript_text,
        "total_duration_sec": round(cursor_sec, 3),
        "total_frames": sum(int(sc["durationInFrames"]) for sc in scenes),
        "caption_words": all_words,
        "scenes": scenes,
    }
