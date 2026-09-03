/**
 * Pure calorie/macro target calculations. No I/O, no React — every export
 * here is a plain function over plain data, safe to unit test directly.
 */

import type { Sex } from "./dri";

export type ActivityLevel = "sedentary" | "light" | "moderate" | "heavy" | "athlete";
export type Goal = "fat_loss" | "muscle_gain" | "maintenance" | "recomposition";

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  heavy: 1.725,
  athlete: 1.9,
};

/** Prescribed calories may never fall below the higher of BMR and this floor. */
export const CALORIE_FLOOR: Record<Sex, number> = { male: 1500, female: 1200 };

const BMI_FLOOR = 18.5;
/** kcal of body mass energy used to convert a weekly bodyweight-change cap into a calorie cap. */
const KCAL_PER_KG = 7700;

export interface BodyStats {
  sex: Sex;
  age: number;
  weightKg: number;
  heightCm: number;
  /** 0-100. When provided, BMR uses Katch-McArdle instead of Mifflin-St Jeor. */
  bodyFatPercent?: number;
}

export function calculateBMI(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
}

export function calculateLBM(weightKg: number, bodyFatPercent: number): number {
  return weightKg * (1 - bodyFatPercent / 100);
}

export function calculateBMR(stats: BodyStats): number {
  if (stats.bodyFatPercent != null) {
    const lbmKg = calculateLBM(stats.weightKg, stats.bodyFatPercent);
    return 370 + 21.6 * lbmKg;
  }
  const base = 10 * stats.weightKg + 6.25 * stats.heightCm - 5 * stats.age;
  return stats.sex === "male" ? base + 5 : base - 161;
}

export function calculateTDEE(bmr: number, activityLevel: ActivityLevel): number {
  return bmr * ACTIVITY_FACTORS[activityLevel];
}

/**
 * Applies the goal-based calorie adjustment to TDEE.
 * `intensity` (0-1) selects where in the recommended range to land:
 * fat_loss: 15% (0) to 25% (1) deficit; muscle_gain: 10% (0) to 15% (1) surplus.
 * Both goals are additionally capped by the weekly-bodyweight-change limits
 * (1.0%/week loss, 0.5%/week gain) — whichever cap is tighter wins.
 */
export function calculateGoalCalories(
  tdee: number,
  weightKg: number,
  goal: Goal,
  intensity = 0.5,
): number {
  if (goal === "maintenance" || goal === "recomposition") return tdee;

  if (goal === "fat_loss") {
    const pct = 15 + intensity * (25 - 15);
    const pctDeficit = tdee * (pct / 100);
    const capKgPerWeek = weightKg * 0.01;
    const capDeficit = (capKgPerWeek * KCAL_PER_KG) / 7;
    return tdee - Math.min(pctDeficit, capDeficit);
  }

  // muscle_gain
  const pct = 10 + intensity * (15 - 10);
  const pctSurplus = tdee * (pct / 100);
  const capKgPerWeek = weightKg * 0.005;
  const capSurplus = (capKgPerWeek * KCAL_PER_KG) / 7;
  return tdee + Math.min(pctSurplus, capSurplus);
}

export interface Macros {
  proteinG: number;
  fatG: number;
  carbG: number;
  fiberG: number;
}

/**
 * Protein: 1.6-2.2 g/kg bodyweight, selected by `intensity` (0-1) — or
 * 2.0-2.4 g/kg lean mass when in a fat_loss deficit and lean mass is known.
 * Fat: max(0.6 g/kg bodyweight, 25% of calories). Carb: remaining calories.
 * Fiber: 14 g per 1000 kcal.
 */
export function calculateMacros(
  calories: number,
  weightKg: number,
  goal: Goal,
  intensity = 0.5,
  lbmKg?: number,
): Macros {
  let proteinG: number;
  if (goal === "fat_loss" && lbmKg != null) {
    const gPerKgLbm = 2.0 + intensity * (2.4 - 2.0);
    proteinG = gPerKgLbm * lbmKg;
  } else {
    const gPerKgBodyweight = 1.6 + intensity * (2.2 - 1.6);
    proteinG = gPerKgBodyweight * weightKg;
  }

  const fatGMin = 0.6 * weightKg;
  const fatGDefault = (calories * 0.25) / 9;
  const fatG = Math.max(fatGMin, fatGDefault);

  const remainingKcal = Math.max(calories - proteinG * 4 - fatG * 9, 0);
  const carbG = remainingKcal / 4;

  const fiberG = (calories / 1000) * 14;

  return { proteinG, fatG, carbG, fiberG };
}

export interface TargetsInput extends BodyStats {
  activityLevel: ActivityLevel;
  goal: Goal;
  /** Optional target bodyweight; validated against the BMI floor if given. */
  goalWeightKg?: number;
  /** 0-1, where in the recommended deficit/surplus/protein range to land. Defaults to 0.5 (middle). */
  intensity?: number;
}

export type TargetsError =
  | { type: "minor"; message: string }
  | { type: "bmi_floor"; message: string };

export interface DailyTargets {
  bmr: number;
  tdee: number;
  calories: number;
  /** True when the safety floor overrode the goal-derived calorie value. */
  clamped: boolean;
  clampReason?: string;
  proteinG: number;
  fatG: number;
  carbG: number;
  fiberG: number;
  /**
   * True when a fat_loss plan needed the safety clamp — i.e. the requested
   * deficit was steep enough to require capping. The UI should show the calm,
   * non-judgmental NEDA-helpline card in this case, once, not repeatedly —
   * that "show once" bookkeeping is UI/persistence state, not this engine's job.
   */
  showEatingDisorderResourceCard: boolean;
}

export type TargetsResult = { ok: true; targets: DailyTargets } | { ok: false; error: TargetsError };

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function calculateTargets(input: TargetsInput): TargetsResult {
  if (input.age < 18) {
    return {
      ok: false,
      error: {
        type: "minor",
        message:
          "We can't generate calorie or macro targets for anyone under 18. Please talk to a doctor or registered dietitian for guidance suited to your age.",
      },
    };
  }

  const bmiFloorMessage =
    "A goal weight below a BMI of 18.5 falls outside a safe range, so this app won't generate a deficit for it. If you have concerns about your weight, please talk to a doctor or registered dietitian.";

  if (input.goalWeightKg != null && calculateBMI(input.goalWeightKg, input.heightCm) < BMI_FLOOR) {
    return { ok: false, error: { type: "bmi_floor", message: bmiFloorMessage } };
  }
  if (
    input.goal === "fat_loss" &&
    input.goalWeightKg == null &&
    calculateBMI(input.weightKg, input.heightCm) < BMI_FLOOR
  ) {
    return { ok: false, error: { type: "bmi_floor", message: bmiFloorMessage } };
  }

  const intensity = input.intensity ?? 0.5;
  const bmr = calculateBMR(input);
  const tdee = calculateTDEE(bmr, input.activityLevel);
  const goalCalories = calculateGoalCalories(tdee, input.weightKg, input.goal, intensity);

  const floor = Math.max(bmr, CALORIE_FLOOR[input.sex]);
  const clamped = goalCalories < floor;
  const calories = clamped ? floor : goalCalories;
  const clampReason = clamped
    ? `Your daily target was set to ${Math.round(floor)} kcal — the higher of your BMR and the general safety minimum — because the calculated value fell below it.`
    : undefined;

  const lbmKg = input.bodyFatPercent != null ? calculateLBM(input.weightKg, input.bodyFatPercent) : undefined;
  const macros = calculateMacros(calories, input.weightKg, input.goal, intensity, lbmKg);

  return {
    ok: true,
    targets: {
      bmr: round1(bmr),
      tdee: round1(tdee),
      calories: Math.round(calories),
      clamped,
      clampReason,
      proteinG: round1(macros.proteinG),
      fatG: round1(macros.fatG),
      carbG: round1(macros.carbG),
      fiberG: round1(macros.fiberG),
      showEatingDisorderResourceCard: clamped && input.goal === "fat_loss",
    },
  };
}
