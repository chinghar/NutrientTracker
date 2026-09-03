import { describe, it, expect } from "vitest";
import { parseExportedData } from "./export";

const VALID_EXPORT = JSON.stringify({
  exportedAt: "2026-01-01T00:00:00.000Z",
  version: 1,
  settings: { visionProvider: "anthropic", plateDiameterCm: 27 },
  mealLogs: [
    {
      id: 1,
      loggedAt: "2026-01-01T12:00:00.000Z",
      items: [
        {
          name: "chicken breast",
          grams: 150,
          confidence: 0.8,
          nutrientsPer100g: { energyKcal: 165, proteinG: 31, seleniumUg: null },
          source: "usda",
        },
      ],
    },
  ],
});

describe("parseExportedData", () => {
  it("parses a well-formed export", () => {
    const data = parseExportedData(VALID_EXPORT);
    expect(data.mealLogs).toHaveLength(1);
    expect(data.settings.visionProvider).toBe("anthropic");
    expect(data.mealLogs[0].items[0].nutrientsPer100g.seleniumUg).toBeNull();
  });

  it("never carries an API key field, even if present in the source object", () => {
    const withKey = JSON.parse(VALID_EXPORT);
    withKey.settings.anthropicApiKey = "sk-ant-should-not-survive";
    const data = parseExportedData(JSON.stringify(withKey));
    expect((data.settings as Record<string, unknown>).anthropicApiKey).toBeUndefined();
  });

  it("throws a clear error on invalid JSON", () => {
    expect(() => parseExportedData("not json")).toThrow(/valid JSON/);
  });

  it("throws a clear error when the shape doesn't match an export", () => {
    expect(() => parseExportedData(JSON.stringify({ foo: "bar" }))).toThrow(/valid nutrition-app export/);
  });

  it("rejects a mealLog item with the wrong source enum value", () => {
    const bad = JSON.parse(VALID_EXPORT);
    bad.mealLogs[0].items[0].source = "made_up_source";
    expect(() => parseExportedData(JSON.stringify(bad))).toThrow();
  });

  it("defaults bodyWeightLogs to an empty array for a pre-Phase-5 export file", () => {
    const data = parseExportedData(VALID_EXPORT);
    expect(data.bodyWeightLogs).toEqual([]);
  });

  it("parses profile and bodyWeightLogs when present", () => {
    const withProfile = JSON.parse(VALID_EXPORT);
    withProfile.profile = {
      sex: "female",
      age: 29,
      weightKg: 63.5,
      heightCm: 168,
      activityLevel: "moderate",
      goal: "fat_loss",
      intensity: 0.4,
    };
    withProfile.bodyWeightLogs = [{ id: 1, date: "2026-01-01", weightKg: 63.5 }];
    const data = parseExportedData(JSON.stringify(withProfile));
    expect(data.profile?.goal).toBe("fat_loss");
    expect(data.bodyWeightLogs).toHaveLength(1);
  });

  it("accepts gemini as a visionProvider value", () => {
    const withGemini = JSON.parse(VALID_EXPORT);
    withGemini.settings.visionProvider = "gemini";
    const data = parseExportedData(JSON.stringify(withGemini));
    expect(data.settings.visionProvider).toBe("gemini");
  });
});
