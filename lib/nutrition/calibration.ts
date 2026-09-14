/**
 * Adaptive TDEE calibration. No I/O, no React — every export is a pure
 * function over plain data.
 *
 * The model: over a >=14 day window, the observed bodyweight trend (ground
 * truth) implies an actual daily calorie surplus/deficit — `~7700 kcal per
 * kg`. Comparing that to what the user actually logged reveals the app's
 * two independent error sources: whether the formula-derived TDEE is right,
 * and whether the vision model's calorie estimates are systematically
 * biased low (the "roughly one third" underestimation documented for this
 * category of app). We anchor maintenance at the profile's formula-derived
 * TDEE (the trusted, physiologically-grounded estimate) and attribute the
 * observed/predicted mismatch to a `loggingBiasFactor` on the logged
 * calories — which is the actionable, correctable half of the equation.
 */

/** kcal of body-mass energy used to convert a weight change into a calorie surplus/deficit. */
export const KCAL_PER_KG = 7700;
export const MIN_CALIBRATION_DAYS = 14;
/** Clamp on the derived bias, so a short/noisy data window can't produce a wild correction. */
const MAX_ABS_BIAS_FACTOR = 0.6;

export interface WeightEntry {
  /** YYYY-MM-DD */
  date: string;
  weightKg: number;
}

/** Exponentially weighted moving average over a bodyweight series, to strip out day-to-day water-weight noise. */
export function computeEwma(series: WeightEntry[], alpha = 0.25): WeightEntry[] {
  if (series.length === 0) return [];
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const result: WeightEntry[] = [];
  let smoothed = sorted[0].weightKg;
  for (const entry of sorted) {
    smoothed = alpha * entry.weightKg + (1 - alpha) * smoothed;
    result.push({ date: entry.date, weightKg: smoothed });
  }
  return result;
}

export interface CalibrationInput {
  /** Raw (unsmoothed) bodyweight logs, any order, spanning the calibration window. */
  weightLogs: WeightEntry[];
  /** Average logged calories per day, over days that actually have logged meals within the window. */
  avgLoggedKcal: number;
  /** Number of days the window spans (weight log span, and separately gated on logging coverage by the caller). */
  days: number;
  /** The user's current formula-derived TDEE (maintenance estimate) from Phase 2. */
  profileTdeeKcal: number;
}

export interface CalibrationResult {
  /** Fraction; positive means logs read that much low (systematic underestimation), negative means they read high. */
  loggingBiasFactor: number;
  /** Maintenance calories implied by taking logged intake at face value against the observed weight trend. */
  impliedMaintenanceKcal: number;
  message: string;
}

/**
 * Runs calibration once at least MIN_CALIBRATION_DAYS of weight-trend and
 * logged-intake data are available. Returns null if there isn't enough data
 * yet (the caller should gate `days`/log coverage before calling this).
 */
export function computeCalibration(input: CalibrationInput): CalibrationResult | null {
  const { weightLogs, avgLoggedKcal, days, profileTdeeKcal } = input;
  if (days < MIN_CALIBRATION_DAYS || weightLogs.length < 2 || avgLoggedKcal <= 0) return null;

  const smoothed = computeEwma(weightLogs);
  const observedChangeKg = smoothed[smoothed.length - 1].weightKg - smoothed[0].weightKg;
  const observedDailyDeltaKcal = (observedChangeKg * KCAL_PER_KG) / days;

  // "Solve for true maintenance calories": the maintenance level that would
  // explain the observed weight change if the logged intake were accurate.
  const impliedMaintenanceKcal = avgLoggedKcal - observedDailyDeltaKcal;

  // The gap between that and the trusted formula TDEE is attributed to
  // logging bias rather than to the formula being wrong.
  let biasFactor = (profileTdeeKcal - impliedMaintenanceKcal) / avgLoggedKcal;
  biasFactor = Math.min(MAX_ABS_BIAS_FACTOR, Math.max(-MAX_ABS_BIAS_FACTOR, biasFactor));

  const percent = Math.round(Math.abs(biasFactor) * 100);
  const direction = biasFactor >= 0 ? "low" : "high";
  const message =
    percent === 0
      ? "Your logs are tracking closely with your weight trend — no adjustment needed."
      : `Your logs read about ${percent}% ${direction} compared with your weight trend — targets adjusted.`;

  return { loggingBiasFactor: biasFactor, impliedMaintenanceKcal, message };
}

/**
 * Applies the bias correction to a prescribed calorie target: if logs read
 * low, the displayed target is lowered so that hitting it (while logging
 * with the same characteristic bias) still reflects true intake at the
 * original target. Never drops below the Phase 2 safety floor.
 */
export function applyCalibrationToTarget(targetKcal: number, biasFactor: number, floorKcal: number): number {
  const adjusted = targetKcal / (1 + biasFactor);
  return Math.max(adjusted, floorKcal);
}
