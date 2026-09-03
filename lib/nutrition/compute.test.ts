import { describe, it, expect } from "vitest";
import {
  computeDailyNutrientTotals,
  computeMealCalorieRange,
  computeMealNutrientSummary,
  computeRange,
  computeRollingAverage,
  roundToSignificantFigures,
  scaleNutrient,
} from "./compute";

describe("scaleNutrient", () => {
  it("scales a per-100g value by grams", () => {
    expect(scaleNutrient(200, 150)).toBeCloseTo(300, 5);
  });

  it("passes null through unchanged (missing data stays missing)", () => {
    expect(scaleNutrient(null, 150)).toBeNull();
  });

  it("returns 0 for 0 grams", () => {
    expect(scaleNutrient(200, 0)).toBe(0);
  });
});

describe("computeRange", () => {
  it("returns a point value (no spread) at confidence 1", () => {
    expect(computeRange(500, 1)).toEqual({ low: 500, high: 500 });
  });

  it("returns the widest spread at confidence 0", () => {
    const { low, high } = computeRange(500, 0);
    expect(low).toBeCloseTo(500 * 0.65, 5);
    expect(high).toBeCloseTo(500 * 1.35, 5);
  });

  it("narrows the spread as confidence increases", () => {
    const low = computeRange(500, 0.3);
    const high = computeRange(500, 0.8);
    expect(high.high - high.low).toBeLessThan(low.high - low.low);
  });

  it("clamps out-of-range confidence values", () => {
    expect(computeRange(500, 2)).toEqual({ low: 500, high: 500 });
    expect(computeRange(500, -1)).toEqual(computeRange(500, 0));
  });
});

describe("computeMealNutrientSummary", () => {
  it("sums a nutrient across items scaled by grams", () => {
    const summary = computeMealNutrientSummary([
      { nutrientsPer100g: { proteinG: 30 }, grams: 150, confidence: 1 },
      { nutrientsPer100g: { proteinG: 10 }, grams: 200, confidence: 1 },
    ]);
    // 30*1.5 + 10*2 = 45 + 20 = 65
    expect(summary.proteinG.value).toBeCloseTo(65, 5);
    expect(summary.proteinG.incomplete).toBe(false);
    expect(summary.proteinG.lowConfidence).toBe(false);
  });

  it("marks a nutrient incomplete when some items lack data, but still sums what's available", () => {
    const summary = computeMealNutrientSummary([
      { nutrientsPer100g: { seleniumUg: 20 }, grams: 100, confidence: 1 },
      { nutrientsPer100g: { seleniumUg: null }, grams: 100, confidence: 1 },
    ]);
    expect(summary.seleniumUg.value).toBeCloseTo(20, 5);
    expect(summary.seleniumUg.incomplete).toBe(true);
    expect(summary.seleniumUg.lowConfidence).toBe(true);
  });

  it("returns null for a nutrient with no data from any item", () => {
    const summary = computeMealNutrientSummary([
      { nutrientsPer100g: { vitB12Ug: null }, grams: 100, confidence: 1 },
    ]);
    expect(summary.vitB12Ug.value).toBeNull();
  });

  it("flags low confidence when any contributing item is below the threshold", () => {
    const summary = computeMealNutrientSummary([
      { nutrientsPer100g: { carbG: 20 }, grams: 100, confidence: 0.3 },
    ]);
    expect(summary.carbG.lowConfidence).toBe(true);
    expect(summary.carbG.incomplete).toBe(false);
  });

  it("does not flag low confidence when all contributing items are confident and complete", () => {
    const summary = computeMealNutrientSummary([
      { nutrientsPer100g: { carbG: 20 }, grams: 100, confidence: 0.9 },
    ]);
    expect(summary.carbG.lowConfidence).toBe(false);
  });
});

describe("computeMealCalorieRange", () => {
  it("sums per-item ranges into a meal-level low/high/point", () => {
    const result = computeMealCalorieRange([
      { nutrientsPer100g: { energyKcal: 200 }, grams: 150, confidence: 1 }, // 300 kcal, no spread
      { nutrientsPer100g: { energyKcal: 100 }, grams: 200, confidence: 0 }, // 200 kcal, +/-35%
    ]);
    expect(result.point).toBe(500);
    // item 2 contributes 200*0.65=130 to 200*1.35=270; item 1 contributes 300 flat
    expect(result.low).toBe(Math.round(300 + 130));
    expect(result.high).toBe(Math.round(300 + 270));
  });

  it("ignores items with no energy data", () => {
    const result = computeMealCalorieRange([{ nutrientsPer100g: {}, grams: 100, confidence: 1 }]);
    expect(result).toEqual({ low: 0, high: 0, point: 0 });
  });
});

describe("roundToSignificantFigures", () => {
  it("rounds to 2 significant figures", () => {
    expect(roundToSignificantFigures(1234, 2)).toBe(1200);
    expect(roundToSignificantFigures(0.0456, 2)).toBeCloseTo(0.046, 5);
    expect(roundToSignificantFigures(5.678, 2)).toBeCloseTo(5.7, 5);
    expect(roundToSignificantFigures(9.99, 2)).toBeCloseTo(10, 5);
  });

  it("handles 0 without dividing by zero", () => {
    expect(roundToSignificantFigures(0, 2)).toBe(0);
  });
});

describe("computeDailyNutrientTotals", () => {
  it("buckets meals by the calendar-day prefix of loggedAt", () => {
    const totals = computeDailyNutrientTotals([
      {
        loggedAt: "2026-03-01T08:00:00.000Z",
        items: [{ nutrientsPer100g: { energyKcal: 200 }, grams: 100, confidence: 1 }],
      },
      {
        loggedAt: "2026-03-01T19:30:00.000Z",
        items: [{ nutrientsPer100g: { energyKcal: 300 }, grams: 100, confidence: 1 }],
      },
      {
        loggedAt: "2026-03-02T08:00:00.000Z",
        items: [{ nutrientsPer100g: { energyKcal: 400 }, grams: 100, confidence: 1 }],
      },
    ]);
    expect(totals["2026-03-01"].energyKcal.value).toBeCloseTo(500, 5);
    expect(totals["2026-03-02"].energyKcal.value).toBeCloseTo(400, 5);
  });
});

describe("computeRollingAverage", () => {
  const dailyTotals = {
    "2026-03-01": { energyKcal: { value: 2000, incomplete: false, lowConfidence: false } },
    "2026-03-02": { energyKcal: { value: 2200, incomplete: false, lowConfidence: false } },
    // 2026-03-03 has no data at all — a gap, not a 0-kcal day
  };

  it("averages only the days that have data, excluding gaps", () => {
    const result = computeRollingAverage(dailyTotals, ["2026-03-01", "2026-03-02", "2026-03-03"]);
    expect(result.average).toBeCloseTo(2100, 5);
    expect(result.daysWithData).toBe(2);
  });

  it("returns null when no day in range has data", () => {
    const result = computeRollingAverage(dailyTotals, ["2026-04-01"]);
    expect(result.average).toBeNull();
    expect(result.daysWithData).toBe(0);
  });
});
