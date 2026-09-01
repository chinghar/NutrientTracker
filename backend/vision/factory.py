from __future__ import annotations

import os

from backend.vision.base import VisionProvider


def _default_provider_name() -> str:
    # VERCEL is set automatically by Vercel on every deployment -- not
    # something to configure. Ollama can't run there, so default to the
    # cloud provider on Vercel and to the free local one everywhere else.
    return "anthropic" if os.environ.get("VERCEL") else "ollama"


def get_vision_provider() -> VisionProvider:
    provider_name = os.environ.get("VISION_PROVIDER", _default_provider_name()).lower()
    if provider_name == "ollama":
        from backend.vision.ollama_provider import LocalOllamaProvider

        return LocalOllamaProvider()
    if provider_name == "anthropic":
        from backend.vision.anthropic_provider import AnthropicProvider

        return AnthropicProvider()
    raise ValueError(f"Unknown VISION_PROVIDER: {provider_name!r}. Expected 'ollama' or 'anthropic'.")
