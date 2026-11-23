"""Shared Gemini 2.5 Flash JSON caller for Okike Academy Pipeline Stages 1-3."""

from __future__ import annotations

import json
import os
from typing import Any

import requests


def call_gemini_json(prompt: str, temperature: float = 0.4) -> dict[str, Any]:
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY environment variable is required for Stages 1-3."
        )

    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-2.5-flash:generateContent?key={api_key}"
    )
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": temperature,
        },
    }
    resp = requests.post(url, json=payload, timeout=90)
    if not resp.ok:
        raise RuntimeError(f"Gemini API error ({resp.status_code}): {resp.text[:400]}")

    data = resp.json()
    text = (
        data.get("candidates", [{}])[0]
        .get("content", {})
        .get("parts", [{}])[0]
        .get("text", "")
    )
    if not text:
        raise RuntimeError("Gemini returned an empty JSON response.")
    return json.loads(text)
