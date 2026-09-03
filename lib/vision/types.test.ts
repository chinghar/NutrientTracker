import { describe, it, expect } from "vitest";
import { mealAnalysisItemSchema, parseMealAnalysis, VisionAnalysisError } from "./types";

/**
 * Simulates the raw text a vision model would return for a fixture meal
 * photo (a plate of grilled chicken, rice, and broccoli) — this is the
 * "fixture image round-trips through the Zod schema" acceptance case.
 */
const FIXTURE_MODEL_RESPONSE = JSON.stringify({
  items: [
    {
      name: "grilled chicken breast",
      foodQuery: "chicken breast roasted",
      estimatedGrams: 170,
      confidence: 0.75,
      reasoning: "Roughly palm-sized and palm-thick portion on the plate.",
    },
    {
      name: "white rice",
      foodQuery: "rice white cooked",
      estimatedGrams: 140,
      confidence: 0.6,
      reasoning: "Cupped mound occupying about a third of the plate.",
    },
    {
      name: "steamed broccoli",
      foodQuery: "broccoli cooked",
      estimatedGrams: 90,
      confidence: 0.65,
      reasoning: "Small florets covering roughly a quarter of the plate.",
    },
  ],
});

describe("parseMealAnalysis: fixture round-trip", () => {
  it("parses a well-formed fixture response into typed items with no nutrient fields", () => {
    const result = parseMealAnalysis(FIXTURE_MODEL_RESPONSE);
    expect(result.items).toHaveLength(3);
    expect(result.items[0]).toEqual({
      name: "grilled chicken breast",
      foodQuery: "chicken breast roasted",
      estimatedGrams: 170,
      confidence: 0.75,
      reasoning: "Roughly palm-sized and palm-thick portion on the plate.",
    });
  });

  it("strips a markdown code fence some models wrap JSON in despite instructions", () => {
    const fenced = "```json\n" + FIXTURE_MODEL_RESPONSE + "\n```";
    const result = parseMealAnalysis(fenced);
    expect(result.items).toHaveLength(3);
  });

  it("never accepts a schema carrying nutrient values", () => {
    const keys = Object.keys(mealAnalysisItemSchema.shape);
    expect(keys.sort()).toEqual(["confidence", "estimatedGrams", "foodQuery", "name", "reasoning"]);
    for (const nutrientKey of ["calories", "protein", "fat", "carbs", "kcal"]) {
      expect(keys).not.toContain(nutrientKey);
    }
  });

  it("throws VisionAnalysisError on unparseable JSON", () => {
    expect(() => parseMealAnalysis("not json at all")).toThrow(VisionAnalysisError);
  });

  it("throws VisionAnalysisError when required fields are missing", () => {
    const invalid = JSON.stringify({ items: [{ name: "chicken" }] });
    expect(() => parseMealAnalysis(invalid)).toThrow(VisionAnalysisError);
  });

  it("throws VisionAnalysisError when confidence is out of range", () => {
    const invalid = JSON.stringify({
      items: [
        {
          name: "chicken",
          foodQuery: "chicken",
          estimatedGrams: 100,
          confidence: 1.5,
          reasoning: "x",
        },
      ],
    });
    expect(() => parseMealAnalysis(invalid)).toThrow(VisionAnalysisError);
  });

  it("throws VisionAnalysisError when items is an empty array", () => {
    expect(() => parseMealAnalysis(JSON.stringify({ items: [] }))).toThrow(VisionAnalysisError);
  });
});
