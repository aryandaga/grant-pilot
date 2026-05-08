import os
import tempfile
from functools import lru_cache
from pathlib import Path

from fastapi import HTTPException, status

SUPPORTED_AUDIO_TYPES = {
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/wav",
    "audio/x-wav",
    "audio/webm",
    "audio/ogg",
    "audio/m4a",
    "video/mp4",
    "application/octet-stream",
}

SUPPORTED_AUDIO_EXTENSIONS = {".mp3", ".mp4", ".m4a", ".wav", ".webm", ".ogg", ".mpeg"}


@lru_cache(maxsize=1)
def _get_whisper_model():
    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Audio transcription is not installed. Run "
                "`pip install -r requirements.txt` in the backend virtual environment."
            ),
        ) from exc

    model_size = os.getenv("WHISPER_MODEL_SIZE", "base")
    device = os.getenv("WHISPER_DEVICE", "cpu")
    compute_type = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
    return WhisperModel(model_size, device=device, compute_type=compute_type)


def transcribe_audio_file(path: str) -> str:
    model = _get_whisper_model()
    segments, _ = model.transcribe(path, vad_filter=True)
    transcript_parts = [segment.text.strip() for segment in segments if segment.text.strip()]
    return " ".join(transcript_parts).strip()


def is_supported_audio_upload(content_type: str | None, filename: str | None) -> bool:
    suffix = Path(filename or "").suffix.lower()
    return (content_type in SUPPORTED_AUDIO_TYPES) or (suffix in SUPPORTED_AUDIO_EXTENSIONS)


def transcribe_audio_bytes(raw_bytes: bytes, filename: str | None) -> str:
    suffix = Path(filename or "").suffix.lower() or ".audio"
    temp_path = ""
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_file.write(raw_bytes)
            temp_path = temp_file.name

        return transcribe_audio_file(temp_path)
    finally:
        if temp_path:
            Path(temp_path).unlink(missing_ok=True)
