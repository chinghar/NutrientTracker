/**
 * Pure nutrient math for the logging/correction flow: scaling per-100g food
 * values by grams, summing across meal items, and turning per-item
 * confidence into display ranges. No I/O, no React.
 */

/** At confidence 0, a value's displayed range spans this much on each side; at confidence 1, it's a point value. */
const MAX_UNCERTAINTY_FRACTION = 0.35;
/** Below this confidence, a nutrient's total gets a visible low-confidence marker in the UI. */
export const LOW_CONFIDENCE_THRESHOLD = 0.5;

export interface NutrientRange {
  low: number;
  high: number;
}

/** Turns a single point estimate + confidence (0-1) into a low/high display range. */
export function computeRange(value: number, confidence: number): NutrientRange {
  const clamped = Math.min(1, Math.max(0, confidence));
  const uncertainty = (1 - clamped) * MAX_UNCERTAINTY_FRACTION;
  return { low: value * (1 - uncertainty), high: value * (1 + uncertainty) };
}

export function scaleNutrient(per100g: number | null, grams: number): number | null {
  if (per100g == null) return null;
  return (per100g * grams) / 100;
}

export interface MealItemForCompute {
  nutrientsPer100g: Record<string, number | null>;
  grams: number;
  /** 0-1. Use 1 for barcode/manual entries — an exact match has no estimation uncertainty. */
  confidence: number;
}

export interface NutrientSummary {
  /** Summed across items that had data for this nutrient; null if none did. */
  value: number | null;
  /** True if at least one contributing item had no data for this nutrient. */
  incomplete: boolean;
  /** True if the total should carry a low-confidence marker in the UI. */
  lowConfidence: boolean;
}

/** Scales and sums every nutrient across a meal's items, tracking missing data and low-confidence contributions. */
export function computeMealNutrientSummary(items: MealItemForCompute[]): Record<string, NutrientSummary> {
  const keys = new Set<string>();
  for (const item of items) {
    for (const key of Object.keys(item.nutrientsPer100g)) keys.add(key);
  }

  const summary: Record<string, NutrientSummary> = {};
  for (const key of keys) {
    let sum = 0;
    let anyValue = false;
    let anyMissing = false;
    let anyLowConfidenceContribution = false;
    for (const item of items) {
      const per100g = item.nutrientsPer100g[key];
      if (per100g == null) {
        anyMissing = true;
        continue;
      }
      sum += (per100g * item.grams) / 100;
      anyValue = true;
      if (item.confidence < LOW_CONFIDENCE_THRESHOLD) anyLowConfidenceContribution = true;
    }
    summary[key] = {
      value: anyValue ? sum : null,
      incomplete: anyMissing,
      lowConfidence: anyMissing || anyLowConfidenceContribution,
    };
  }
  return summary;
}

/** Calories specifically, as a confidence-derived low/high range (the headline number on the correction screen). */
export function computeMealCalorieRange(items: MealItemForCompute[]): NutrientRange & { point: number } {
  let low = 0;
  let high = 0;
  let point = 0;
  for (const item of items) {
    const per100g = item.nutrientsPer100g.energyKcal;
    if (per100g == null) continue;
    const kcal = (per100g * item.grams) / 100;
    const range = computeRange(kcal, item.confidence);
    low += range.low;
    high += range.high;
    point += kcal;
  }
  return { low: Math.round(low), high: Math.round(high), point: Math.round(point) };
}

/** Rounds to at most `sigFigs` significant figures — used so micronutrient displays never show false precision. */
export function roundToSignificantFigures(value: number, sigFigs: number): number {
  if (value === 0 || !Number.isFinite(value)) return 0;
  const magnitude = Math.floor(Math.log10(Math.abs(value)));
  const factor = 10 ** (sigFigs - 1 - magnitude);
  return Math.round(value * factor) / factor;
}

export interface DailyMealsInput {
  /** ISO timestamp; only the YYYY-MM-DD prefix is used to bucket by calendar day. */
  loggedAt: string;
  items: MealItemForCompute[];
}

/** Groups meals by calendar day and sums each day's nutrient totals — shared by the dashboard's daily/rolling views and calibration. */
export function computeDailyNutrientTotals(meals: DailyMealsInput[]): Record<string, Record<string, NutrientSummary>> {
  const byDay = new Map<string, MealItemForCompute[]>();
  for (const meal of meals) {
    const day = meal.loggedAt.slice(0, 10);
    const list = byDay.get(day);
    if (list) {
      list.push(...meal.items);
    } else {
      byDay.set(day, [...meal.items]);
    }
  }
  const result: Record<string, Record<string, NutrientSummary>> = {};
  for (const [day, items] of byDay) {
    result[day] = computeMealNutrientSummary(items);
  }
  return result;
}

/** Averages a nutrient across whichever of the given days actually have data — missing days are excluded, not treated as 0. */
export function computeRollingAverage(
  dailyTotals: Record<string, Record<string, NutrientSummary>>,
  days: string[],
  nutrientKey = "energyKcal",
): { average: number | null; daysWithData: number } {
  let sum = 0;
  let count = 0;
  for (const day of days) {
    const value = dailyTotals[day]?.[nutrientKey]?.value;
    if (value != null) {
      sum += value;
      count++;
    }
  }
  return { average: count > 0 ? sum / count : null, daysWithData: count };
}
