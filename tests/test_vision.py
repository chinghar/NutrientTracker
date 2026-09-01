"""Contract tests: both VisionProvider implementations must behave
identically given the same model responses, using a fixture image. The
underlying HTTP/SDK calls are monkeypatched out -- no real Ollama instance
or Anthropic API key is needed to run these.
"""

from __future__ import annotations

import base64

import pytest
from pydantic import ValidationError

from backend.vision import base as vision_base
from backend.vision.anthropic_provider import AnthropicProvider
from backend.vision.ollama_provider import LocalOllamaProvider

# A minimal valid 1x1 PNG, used as the fixture image for both providers.
FIXTURE_IMAGE = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)

VALID_JSON = (
    '{"items": [{"name": "grilled chicken breast", "usda_query": "chicken breast grilled", '
    '"estimated_grams": 150, "confidence": 0.8, "reasoning": "roughly palm-sized portion"}]}'
)


def _build_provider(provider_name: str, monkeypatch: pytest.MonkeyPatch, responses: list[str]):
    calls = iter(responses)

    if provider_name == "ollama":
        provider = LocalOllamaProvider(host="http://fake-host", model="fake-model")
        monkeypatch.setattr(provider, "_call_ollama", lambda prompt, image_b64: next(calls))
        return provider

    if provider_name == "anthropic":
        class FakeMessages:
            def create(self, **kwargs):
                text = next(calls)
                block = type("Block", (), {"type": "text", "text": text})()
                return type("Response", (), {"content": [block]})()

        class FakeClient:
            def __init__(self):
                self.messages = FakeMessages()

        return AnthropicProvider(model="fake-model", client=FakeClient())

    raise ValueError(provider_name)


PROVIDER_NAMES = ["ollama", "anthropic"]


@pytest.mark.parametrize("provider_name", PROVIDER_NAMES)
def test_analyze_returns_valid_meal_analysis(provider_name, monkeypatch):
    provider = _build_provider(provider_name, monkeypatch, [VALID_JSON])
    result = provider.analyze(FIXTURE_IMAGE, hint="on a white plate")

    assert isinstance(result, vision_base.MealAnalysis)
    assert len(result.items) == 1
    item = result.items[0]
    assert item.name == "grilled chicken breast"
    assert item.usda_query == "chicken breast grilled"
    assert item.estimated_grams == 150
    assert 0 <= item.confidence <= 1
    assert item.reasoning


@pytest.mark.parametrize("provider_name", PROVIDER_NAMES)
def test_analyze_strips_markdown_code_fences(provider_name, monkeypatch):
    fenced = f"```json\n{VALID_JSON}\n```"
    provider = _build_provider(provider_name, monkeypatch, [fenced])
    result = provider.analyze(FIXTURE_IMAGE)
    assert len(result.items) == 1


@pytest.mark.parametrize("provider_name", PROVIDER_NAMES)
def test_analyze_retries_once_then_succeeds(provider_name, monkeypatch):
    provider = _build_provider(provider_name, monkeypatch, ["not json at all", VALID_JSON])
    result = provider.analyze(FIXTURE_IMAGE)
    assert len(result.items) == 1


@pytest.mark.parametrize("provider_name", PROVIDER_NAMES)
def test_analyze_falls_back_to_manual_entry_after_two_failures(provider_name, monkeypatch):
    provider = _build_provider(provider_name, monkeypatch, ["garbage", "still garbage"])
    with pytest.raises(vision_base.VisionProviderError):
        provider.analyze(FIXTURE_IMAGE)


@pytest.mark.parametrize("provider_name", PROVIDER_NAMES)
def test_analyze_never_calls_model_more_than_twice(provider_name, monkeypatch):
    call_count = 0
    real_responses = ["garbage", "still garbage"]

    if provider_name == "ollama":
        provider = LocalOllamaProvider(host="http://fake-host", model="fake-model")

        def fake_call(prompt, image_b64):
            nonlocal call_count
            call_count += 1
            return real_responses[call_count - 1]

        monkeypatch.setattr(provider, "_call_ollama", fake_call)
    else:
        class FakeMessages:
            def create(self, **kwargs):
                nonlocal call_count
                call_count += 1
                text = real_responses[call_count - 1]
                block = type("Block", (), {"type": "text", "text": text})()
                return type("Response", (), {"content": [block]})()

        class FakeClient:
            def __init__(self):
                self.messages = FakeMessages()

        provider = AnthropicProvider(model="fake-model", client=FakeClient())

    with pytest.raises(vision_base.VisionProviderError):
        provider.analyze(FIXTURE_IMAGE)
    assert call_count == 2


def test_meal_item_rejects_extra_nutrient_fields():
    # The schema itself is the enforcement that vision models never supply
    # nutrient values -- an extra "calories" field must be rejected, not
    # silently accepted, so a hallucinating model triggers the retry/fallback
    # path instead of polluting the pipeline with an ungrounded number.
    with pytest.raises(ValidationError):
        vision_base.MealItem(
            name="banana",
            usda_query="banana raw",
            estimated_grams=120,
            confidence=0.9,
            reasoning="medium banana",
            calories=105,
        )


def test_meal_analysis_rejects_extra_top_level_fields():
    with pytest.raises(ValidationError):
        vision_base.MealAnalysis.model_validate_json(
            '{"items": [], "total_calories": 500}'
        )


def test_anthropic_provider_construction_never_raises_without_a_key(monkeypatch):
    # Construction happens during FastAPI dependency resolution, before a
    # route's own try/except can see it -- raising here would turn a missing
    # key into a 500 instead of the manual-entry fallback. The check must be
    # deferred to analyze() instead.
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    AnthropicProvider()  # must not raise


def test_anthropic_provider_analyze_raises_cleanly_without_a_key(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    provider = AnthropicProvider()
    with pytest.raises(vision_base.VisionProviderError):
        provider.analyze(FIXTURE_IMAGE)


def test_ollama_provider_wraps_connection_errors(monkeypatch):
    provider = LocalOllamaProvider(host="http://127.0.0.1:1", model="fake-model", timeout=1.0)
    with pytest.raises(vision_base.VisionProviderError):
        provider.analyze(FIXTURE_IMAGE)


# --- Provider selection: no VISION_PROVIDER env var should be required ----


def test_factory_defaults_to_ollama_locally(monkeypatch):
    from backend.vision import factory

    monkeypatch.delenv("VISION_PROVIDER", raising=False)
    monkeypatch.delenv("VERCEL", raising=False)
    provider = factory.get_vision_provider()
    assert isinstance(provider, LocalOllamaProvider)


def test_factory_defaults_to_anthropic_on_vercel(monkeypatch):
    from backend.vision import factory

    monkeypatch.delenv("VISION_PROVIDER", raising=False)
    monkeypatch.setenv("VERCEL", "1")
    provider = factory.get_vision_provider()
    assert isinstance(provider, AnthropicProvider)


def test_factory_explicit_env_var_overrides_the_vercel_default(monkeypatch):
    from backend.vision import factory

    monkeypatch.setenv("VISION_PROVIDER", "ollama")
    monkeypatch.setenv("VERCEL", "1")
    provider = factory.get_vision_provider()
    assert isinstance(provider, LocalOllamaProvider)
