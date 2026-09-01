"""Vision provider interface. Every provider identifies foods and estimates
mass from a photo -- nothing more. Nutrient values are never asked of, or
accepted from, a vision model; they come from a USDA database join on
`usda_query` keyed against `estimated_grams`, in a later pipeline stage.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Callable

from pydantic import BaseModel, ConfigDict, Field, ValidationError


class MealItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    usda_query: str
    estimated_grams: float = Field(gt=0)
    confidence: float = Field(ge=0, le=1)
    reasoning: str


class MealAnalysis(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[MealItem]


class VisionProviderError(Exception):
    """Raised when a provider can't produce a valid MealAnalysis after one
    retry. Callers should fall back to manual entry, not guess."""


ANALYSIS_INSTRUCTIONS = """You are a food identification assistant. Look at the photo of a meal and identify each distinct food item.

For each item, provide:
- name: a short human-readable name (e.g. "grilled chicken breast")
- usda_query: a search string suitable for looking up this food in the USDA FoodData Central database (e.g. "chicken breast grilled")
- estimated_grams: your best estimate of the item's mass in grams, based on visual portion size
- confidence: a number from 0 to 1 for how confident you are in the identification and mass estimate
- reasoning: one brief sentence explaining your mass estimate (e.g. reference objects, plate size, typical portion)

Do NOT provide calorie or nutrient values -- those are looked up separately from a nutrition database using usda_query and estimated_grams.

Respond with ONLY a JSON object of this exact shape, no other text, no markdown code fences:
{"items": [{"name": "...", "usda_query": "...", "estimated_grams": 0, "confidence": 0.0, "reasoning": "..."}]}"""

RETRY_INSTRUCTIONS = """Your previous response was not valid JSON matching the required schema. Respond again with ONLY a JSON object of this exact shape, no markdown code fences, no other text:
{"items": [{"name": "...", "usda_query": "...", "estimated_grams": 0, "confidence": 0.0, "reasoning": "..."}]}

Your previous response was:
%%PREVIOUS_RESPONSE%%"""


def build_prompt(hint: str | None) -> str:
    prompt = ANALYSIS_INSTRUCTIONS
    if hint:
        prompt += f"\n\nAdditional context from the user: {hint}"
    return prompt


def build_retry_prompt(hint: str | None, previous_response: str) -> str:
    retry_block = RETRY_INSTRUCTIONS.replace("%%PREVIOUS_RESPONSE%%", previous_response)
    return build_prompt(hint) + "\n\n" + retry_block


def extract_json_object(text: str) -> str:
    """Strip markdown code fences and surrounding prose some models add
    despite being told not to, leaving the {...} JSON object."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end < start:
        return text
    return text[start : end + 1]


def parse_meal_analysis(raw_text: str) -> MealAnalysis:
    json_str = extract_json_object(raw_text)
    return MealAnalysis.model_validate_json(json_str)


class VisionProvider(ABC):
    @abstractmethod
    def analyze(self, image_bytes: bytes, hint: str | None = None) -> MealAnalysis: ...

    def _analyze_with_retry(self, call_model: Callable[[str], str], hint: str | None) -> MealAnalysis:
        """Shared retry-then-fail flow: call the model, try to parse; on
        parse failure, ask once more with stricter instructions; on a
        second failure, raise so the caller falls back to manual entry
        rather than guessing.
        """
        raw = call_model(build_prompt(hint))
        try:
            return parse_meal_analysis(raw)
        except (ValidationError, ValueError):
            raw_retry = call_model(build_retry_prompt(hint, raw))
            try:
                return parse_meal_analysis(raw_retry)
            except (ValidationError, ValueError) as second_error:
                raise VisionProviderError(
                    "Vision model did not return valid JSON after one retry; falling back to manual entry."
                ) from second_error
