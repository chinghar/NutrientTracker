from __future__ import annotations

import os

from backend.vision.base import VisionProvider


def get_vision_provider() -> VisionProvider:
    provider_name = os.environ.get("VISION_PROVIDER", "ollama").lower()
    if provider_name == "ollama":
        from backend.vision.ollama_provider import LocalOllamaProvider

        return LocalOllamaProvider()
    if provider_name == "anthropic":
        from backend.vision.anthropic_provider import AnthropicProvider

        return AnthropicProvider()
    raise ValueError(f"Unknown VISION_PROVIDER: {provider_name!r}. Expected 'ollama' or 'anthropic'.")
