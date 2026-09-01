"""Vision provider backed by the Anthropic Messages API. Reads
ANTHROPIC_API_KEY from the environment -- never hardcode a key."""

from __future__ import annotations

import base64
import os

import anthropic

from backend.vision.base import MealAnalysis, VisionProvider, VisionProviderError

DEFAULT_ANTHROPIC_MODEL = "claude-opus-5"


def _detect_media_type(image_bytes: bytes) -> str:
    if image_bytes.startswith(b"\xff\xd8"):
        return "image/jpeg"
    if image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if image_bytes.startswith(b"GIF87a") or image_bytes.startswith(b"GIF89a"):
        return "image/gif"
    if image_bytes[:4] == b"RIFF" and image_bytes[8:12] == b"WEBP":
        return "image/webp"
    return "image/jpeg"


class AnthropicProvider(VisionProvider):
    def __init__(self, model: str | None = None, client: "anthropic.Anthropic | None" = None):
        # Deliberately does not check for ANTHROPIC_API_KEY or construct the
        # client here: this runs during FastAPI dependency resolution, before
        # a route's own try/except can see it, so raising here would turn a
        # missing key into a 500 instead of the manual-entry fallback. The
        # check happens lazily in analyze() instead, which the caller does
        # wrap in a try/except VisionProviderError.
        self.model = model or os.environ.get("ANTHROPIC_VISION_MODEL", DEFAULT_ANTHROPIC_MODEL)
        self._injected_client = client

    def analyze(self, image_bytes: bytes, hint: str | None = None) -> MealAnalysis:
        client = self._injected_client
        if client is None:
            if not os.environ.get("ANTHROPIC_API_KEY"):
                raise VisionProviderError(
                    "ANTHROPIC_API_KEY is not set. Photo analysis is unavailable until it's configured; "
                    "search or scan a barcode instead."
                )
            client = anthropic.Anthropic()
        self.client = client

        media_type = _detect_media_type(image_bytes)
        image_b64 = base64.standard_b64encode(image_bytes).decode("utf-8")
        return self._analyze_with_retry(
            lambda prompt: self._call_anthropic(prompt, image_b64, media_type), hint
        )

    def _call_anthropic(self, prompt: str, image_b64: str, media_type: str) -> str:
        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=2048,
                output_config={"effort": "low"},
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {"type": "base64", "media_type": media_type, "data": image_b64},
                            },
                            {"type": "text", "text": prompt},
                        ],
                    }
                ],
            )
        except anthropic.APIError as e:
            raise VisionProviderError(f"Anthropic API call failed: {e}") from e
        return "".join(block.text for block in response.content if block.type == "text")
