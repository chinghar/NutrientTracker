"""Default vision provider: a local Ollama instance running a vision model.
Zero marginal cost per photo."""

from __future__ import annotations

import base64
import json
import os
import urllib.request

from backend.vision.base import MealAnalysis, VisionProvider, VisionProviderError

DEFAULT_OLLAMA_HOST = "http://localhost:11434"
DEFAULT_OLLAMA_MODEL = "qwen2.5vl"


class LocalOllamaProvider(VisionProvider):
    def __init__(self, host: str | None = None, model: str | None = None, timeout: float = 120.0):
        self.host = host or os.environ.get("OLLAMA_HOST", DEFAULT_OLLAMA_HOST)
        self.model = model or os.environ.get("OLLAMA_VISION_MODEL", DEFAULT_OLLAMA_MODEL)
        self.timeout = timeout

    def analyze(self, image_bytes: bytes, hint: str | None = None) -> MealAnalysis:
        image_b64 = base64.b64encode(image_bytes).decode("ascii")
        return self._analyze_with_retry(lambda prompt: self._call_ollama(prompt, image_b64), hint)

    def _call_ollama(self, prompt: str, image_b64: str) -> str:
        body = json.dumps(
            {
                "model": self.model,
                "prompt": prompt,
                "images": [image_b64],
                "format": "json",
                "stream": False,
            }
        ).encode("utf-8")
        req = urllib.request.Request(
            f"{self.host.rstrip('/')}/api/generate",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except OSError as e:
            raise VisionProviderError(
                f"Could not reach Ollama at {self.host}. Is `ollama serve` running, "
                f"and has `ollama pull {self.model}` been run?"
            ) from e
        return payload.get("response", "")
