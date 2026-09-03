/** Shared prompt used by every VisionProvider, so identical instructions go to every model. */
export function buildMealAnalysisPrompt(hint?: string): string {
  return `You are analyzing a photo of a meal for a nutrition tracking app.

Identify each distinct food item visible in the photo and estimate its portion size in grams.
${hint ? `Scale hint from the user: ${hint}\n` : ""}
Respond with ONLY raw JSON, no markdown code fences, no prose before or after, matching exactly this shape:

{
  "items": [
    {
      "name": "short human-readable name, e.g. \\"grilled chicken breast\\"",
      "foodQuery": "a plain search phrase for a USDA food database, e.g. \\"chicken breast roasted\\"",
      "estimatedGrams": 150,
      "confidence": 0.7,
      "reasoning": "one short sentence on how you estimated the mass"
    }
  ]
}

Rules:
- List every visually distinct food item separately (do not merge a whole plate into one item).
- estimatedGrams must be your best single-number estimate of that item's mass in grams.
- confidence is 0 to 1, reflecting how certain you are about identity AND portion together.
- Do NOT include calories, protein, fat, carbs, vitamins, minerals, or any other nutrient values anywhere in your response — nutrition is looked up separately from a food database, not estimated by you.
- Do NOT include any text outside the JSON object.`;
}
