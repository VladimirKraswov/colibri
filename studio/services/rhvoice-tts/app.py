from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Iterator

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field


class SpeakRequest(BaseModel):
    text: str = Field(min_length=1, max_length=200_000)
    voice: str = Field(default="anna", max_length=80)
    rate: int = Field(default=100, ge=50, le=220)
    pitch: int = Field(default=100, ge=50, le=180)
    volume: int = Field(default=100, ge=20, le=200)
    sample_rate: int = Field(default=24_000, ge=8_000, le=48_000)


app = FastAPI(title="RHVoice TTS", version="1.0.0")

DEFAULT_VOICES = [
    {"id": "anna", "label": "Анна"},
    {"id": "irina", "label": "Ирина"},
    {"id": "aleksandr", "label": "Александр"},
    {"id": "elena", "label": "Елена"},
]


@app.get("/health")
def health() -> dict:
    return {"ok": True, "status": "ok", "engine": "RHVoice", "version": "1.8"}


@app.get("/voices")
def voices() -> list[dict[str, str]]:
    return discover_voices() or DEFAULT_VOICES


@app.post("/speak")
def speak(payload: SpeakRequest) -> StreamingResponse:
    text = normalize_text(payload.text)
    if not text:
        raise HTTPException(status_code=400, detail="Text is empty")
    command = [
        "RHVoice-test",
        "-o", "-",
        "-p", payload.voice,
        "-r", str(payload.rate),
        "-t", str(payload.pitch),
        "-v", str(payload.volume),
        "-R", str(payload.sample_rate),
    ]
    process = subprocess.Popen(
        command,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    assert process.stdin is not None
    process.stdin.write(text.encode("utf-8"))
    process.stdin.close()
    return StreamingResponse(
        stream_process_stdout(process),
        media_type="audio/wav",
        headers={"Cache-Control": "no-store"},
    )


def stream_process_stdout(process: subprocess.Popen) -> Iterator[bytes]:
    try:
        assert process.stdout is not None
        while chunk := process.stdout.read(64 * 1024):
            yield chunk
        process.wait(timeout=10)
        if process.returncode:
            raise RuntimeError(f"RHVoice exited with code {process.returncode}")
    finally:
        if process.poll() is None:
            process.kill()
        for stream in (process.stdout, process.stderr):
            try:
                stream and stream.close()
            except OSError:
                pass


def normalize_text(text: str) -> str:
    return "\n".join(
        line.rstrip()
        for line in str(text or "").replace("\r\n", "\n").replace("\r", "\n").split("\n")
    ).strip()


def discover_voices() -> list[dict[str, str]]:
    roots = [
        Path("/usr/share/RHVoice/voices"),
        Path("/usr/local/share/RHVoice/voices"),
        Path("/var/lib/RHVoice/data/voices"),
        Path("/usr/share/rhvoice/voices"),
    ]
    result: list[dict[str, str]] = []
    seen: set[str] = set()
    for root in roots:
        if not root.exists():
            continue
        for path in sorted(item for item in root.iterdir() if item.is_dir()):
            if path.name in seen:
                continue
            seen.add(path.name)
            result.append({"id": path.name, "label": voice_label(path.name)})
    return result


def voice_label(value: str) -> str:
    return value.replace("-", " ").replace("_", " ").title()
