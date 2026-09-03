import { describe, it, expect } from "vitest";
import { extractGeminiText, GEMINI_DEFAULT_MODEL, GEMINI_MODELS } from "./gemini-provider";
import { parseMealAnalysis } from "./types";

describe("GEMINI_MODELS", () => {
  it("is a non-empty list containing the default model", () => {
    expect(GEMINI_MODELS.length).toBeGreaterThan(0);
    expect(GEMINI_MODELS.some((m) => m.id === GEMINI_DEFAULT_MODEL)).toBe(true);
  });
});

describe("extractGeminiText", () => {
  it("extracts text from a well-formed candidate response", () => {
    const text = extractGeminiText({
      candidates: [{ content: { parts: [{ text: "hello" }] } }],
    });
    expect(text).toBe("hello");
  });

  it("returns undefined when there are no candidates", () => {
    expect(extractGeminiText({ candidates: [] })).toBeUndefined();
    expect(extractGeminiText({})).toBeUndefined();
  });

  it("returns undefined when a part has no text field (e.g. blocked response)", () => {
    expect(extractGeminiText({ candidates: [{ content: { parts: [{}] } }] })).toBeUndefined();
  });
});

describe("GeminiBrowserProvider: fixture round-trip", () => {
  it("a fixture meal-photo response extracts and parses into a valid MealAnalysis", () => {
    // Simulates the raw generateContent response for a fixture meal photo
    // (a plate of grilled salmon and asparagus) with response_mime_type
    // forcing JSON, exactly as GeminiBrowserProvider requests it.
    const fixtureResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  items: [
                    {
                      name: "grilled salmon",
                      foodQuery: "salmon grilled",
                      estimatedGrams: 140,
                      confidence: 0.7,
                      reasoning: "Fillet roughly the size of a deck of cards.",
                    },
                    {
                      name: "asparagus",
                      foodQuery: "asparagus cooked",
                      estimatedGrams: 80,
                      confidence: 0.65,
                      reasoning: "About six spears visible on the plate.",
                    },
                  ],
                }),
              },
            ],
          },
        },
      ],
    };

    const text = extractGeminiText(fixtureResponse);
    expect(text).toBeTruthy();

    const analysis = parseMealAnalysis(text!);
    expect(analysis.items).toHaveLength(2);
    expect(analysis.items[0]).toEqual({
      name: "grilled salmon",
      foodQuery: "salmon grilled",
      estimatedGrams: 140,
      confidence: 0.7,
      reasoning: "Fillet roughly the size of a deck of cards.",
    });
  });

  it("a response wrapped in a markdown fence still round-trips (models sometimes ignore the raw-JSON instruction)", () => {
    const fixtureResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text:
                  "```json\n" +
                  JSON.stringify({
                    items: [
                      {
                        name: "toast",
                        foodQuery: "bread toasted",
                        estimatedGrams: 30,
                        confidence: 0.8,
                        reasoning: "One slice.",
                      },
                    ],
                  }) +
                  "\n```",
              },
            ],
          },
        },
      ],
    };

    const text = extractGeminiText(fixtureResponse);
    const analysis = parseMealAnalysis(text!);
    expect(analysis.items).toHaveLength(1);
    expect(analysis.items[0].name).toBe("toast");
  });
});
