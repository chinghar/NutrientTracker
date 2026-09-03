import { describe, it, expect } from "vitest";
import {
  calculateBMI,
  calculateBMR,
  calculateGoalCalories,
  calculateMacros,
  calculateTargets,
  calculateTDEE,
  ACTIVITY_FACTORS,
  CALORIE_FLOOR,
} from "./targets";

describe("calculateBMI", () => {
  it("computes weight over height-in-meters squared", () => {
    expect(calculateBMI(70, 175)).toBeCloseTo(22.857, 2);
  });
});

describe("calculateBMR", () => {
  it("uses Mifflin-St Jeor (male) when no body fat % is given", () => {
    // 10*80 + 6.25*180 - 5*30 + 5
    expect(calculateBMR({ sex: "male", age: 30, weightKg: 80, heightCm: 180 })).toBeCloseTo(1780, 5);
  });

  it("uses Mifflin-St Jeor (female) when no body fat % is given", () => {
    // 10*65 + 6.25*165 - 5*28 - 161
    expect(calculateBMR({ sex: "female", age: 28, weightKg: 65, heightCm: 165 })).toBeCloseTo(1380.25, 5);
  });

  it("uses Katch-McArdle when body fat % is provided, regardless of sex", () => {
    // LBM = 80 * 0.85 = 68; BMR = 370 + 21.6*68
    const stats = { sex: "male" as const, age: 30, weightKg: 80, heightCm: 180, bodyFatPercent: 15 };
    expect(calculateBMR(stats)).toBeCloseTo(1838.8, 5);
  });
});

describe("calculateTDEE", () => {
  it.each(Object.entries(ACTIVITY_FACTORS))("applies the %s activity factor", (level, factor) => {
    expect(calculateTDEE(1800, level as keyof typeof ACTIVITY_FACTORS)).toBeCloseTo(1800 * factor, 5);
  });
});

describe("calculateGoalCalories", () => {
  it("applies a percentage deficit for fat_loss when under the weekly-loss cap", () => {
    // intensity 0 -> 15% of 2500 = 375; cap = 0.8kg/wk*7700/7 = 880 (not binding)
    expect(calculateGoalCalories(2500, 80, "fat_loss", 0)).toBeCloseTo(2125, 2);
  });

  it("caps the fat_loss deficit at 1.0% bodyweight/week when the percentage would exceed it", () => {
    // intensity 1 -> 25% of 3000 = 750; cap = 0.5kg/wk*7700/7 = 550 (binding)
    expect(calculateGoalCalories(3000, 50, "fat_loss", 1)).toBeCloseTo(2450, 2);
  });

  it("applies a percentage surplus for muscle_gain when under the weekly-gain cap", () => {
    // intensity 0 -> 10% of 2500 = 250; cap = 0.4kg/wk*7700/7 = 440 (not binding)
    expect(calculateGoalCalories(2500, 80, "muscle_gain", 0)).toBeCloseTo(2750, 2);
  });

  it("caps the muscle_gain surplus at 0.5% bodyweight/week when the percentage would exceed it", () => {
    // intensity 1 -> 15% of 3000 = 450; cap = 0.25kg/wk*7700/7 = 275 (binding)
    expect(calculateGoalCalories(3000, 50, "muscle_gain", 1)).toBeCloseTo(3275, 2);
  });

  it("returns TDEE unchanged for maintenance", () => {
    expect(calculateGoalCalories(2400, 75, "maintenance")).toBe(2400);
  });

  it("returns TDEE unchanged for recomposition", () => {
    expect(calculateGoalCalories(2400, 75, "recomposition")).toBe(2400);
  });
});

describe("calculateMacros", () => {
  it("scales protein across the 1.6-2.2 g/kg bodyweight range by intensity", () => {
    expect(calculateMacros(2500, 70, "maintenance", 0).proteinG).toBeCloseTo(1.6 * 70, 5);
    expect(calculateMacros(2500, 70, "maintenance", 1).proteinG).toBeCloseTo(2.2 * 70, 5);
  });

  it("uses 2.0-2.4 g/kg lean mass for protein when fat_loss and lean mass are known", () => {
    // LBM 64kg, intensity 0.5 -> 2.2 g/kg
    expect(calculateMacros(2000, 80, "fat_loss", 0.5, 64).proteinG).toBeCloseTo(140.8, 5);
  });

  it("enforces the 0.6 g/kg fat minimum when 25% of calories would be lower", () => {
    // 25% of 1500 / 9 = 41.67g, but 0.6*90 = 54g minimum
    expect(calculateMacros(1500, 90, "maintenance", 0.5).fatG).toBeCloseTo(54, 5);
  });

  it("defaults fat to 25% of calories when that's above the minimum", () => {
    // 25% of 3000 / 9 = 83.33g, above 0.6*50 = 30g minimum
    expect(calculateMacros(3000, 50, "maintenance", 0.5).fatG).toBeCloseTo(83.333, 2);
  });

  it("fills carbohydrate with remaining calories after protein and fat", () => {
    const macros = calculateMacros(2500, 80, "maintenance", 0.5);
    const proteinKcal = macros.proteinG * 4;
    const fatKcal = macros.fatG * 9;
    expect(macros.carbG).toBeCloseTo((2500 - proteinKcal - fatKcal) / 4, 5);
  });

  it("sets fiber to 14g per 1000 kcal", () => {
    expect(calculateMacros(2000, 70, "maintenance", 0.5).fiberG).toBeCloseTo(28, 5);
  });
});

describe("calculateTargets: calorie floor clamp", () => {
  it("clamps to BMR when BMR exceeds the sex-based floor (male)", () => {
    const result = calculateTargets({
      sex: "male",
      age: 25,
      weightKg: 60,
      heightCm: 170,
      activityLevel: "sedentary",
      goal: "fat_loss",
      intensity: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // BMR = 1542.5, above the 1500 male floor, so BMR itself becomes the floor.
    expect(result.targets.bmr).toBeCloseTo(1542.5, 1);
    expect(result.targets.clamped).toBe(true);
    expect(result.targets.calories).toBe(1543);
    expect(result.targets.clampReason).toBeTruthy();
    expect(result.targets.showEatingDisorderResourceCard).toBe(true);
  });

  it("clamps to the 1200 kcal female floor when it exceeds BMR", () => {
    const result = calculateTargets({
      sex: "female",
      age: 20,
      weightKg: 45,
      heightCm: 150,
      activityLevel: "sedentary",
      goal: "fat_loss",
      intensity: 0,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // BMR = 1126.5, below the 1200 female floor, so the floor wins.
    expect(result.targets.bmr).toBeCloseTo(1126.5, 1);
    expect(result.targets.calories).toBe(1200);
    expect(result.targets.clamped).toBe(true);
  });

  it("never shows the eating-disorder card for a clamped muscle_gain plan", () => {
    // Tiny, older, sedentary person: TDEE itself is below the floor, so the
    // floor raises calories even though there's no deficit at all.
    const result = calculateTargets({
      sex: "female",
      age: 70,
      weightKg: 40,
      heightCm: 140,
      activityLevel: "sedentary",
      goal: "muscle_gain",
      intensity: 0,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.targets.clamped).toBe(true);
    expect(result.targets.showEatingDisorderResourceCard).toBe(false);
  });

  it("does not clamp a reasonable maintenance plan", () => {
    const result = calculateTargets({
      sex: "male",
      age: 30,
      weightKg: 80,
      heightCm: 180,
      activityLevel: "moderate",
      goal: "maintenance",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.targets.clamped).toBe(false);
    expect(result.targets.showEatingDisorderResourceCard).toBe(false);
    expect(CALORIE_FLOOR.male).toBe(1500);
  });
});

describe("calculateTargets: BMI floor rejection", () => {
  it("rejects a goal weight below BMI 18.5, regardless of goal type", () => {
    const result = calculateTargets({
      sex: "female",
      age: 30,
      weightKg: 70,
      heightCm: 170,
      activityLevel: "light",
      goal: "maintenance",
      goalWeightKg: 50, // BMI ~17.3
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("bmi_floor");
    expect(result.error.message).toMatch(/18\.5/);
  });

  it("rejects a fat_loss goal when current weight is already below BMI 18.5, with no goal weight given", () => {
    const result = calculateTargets({
      sex: "male",
      age: 30,
      weightKg: 50,
      heightCm: 170,
      activityLevel: "light",
      goal: "fat_loss",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("bmi_floor");
  });

  it("does not reject a low-BMI maintenance plan with no goal weight (no deficit is being generated)", () => {
    const result = calculateTargets({
      sex: "male",
      age: 30,
      weightKg: 50,
      heightCm: 170,
      activityLevel: "light",
      goal: "maintenance",
    });
    expect(result.ok).toBe(true);
  });
});

describe("calculateTargets: minor rejection", () => {
  it("rejects any onboarding attempt under age 18, before other validation", () => {
    const result = calculateTargets({
      sex: "female",
      age: 15,
      weightKg: 45,
      heightCm: 160,
      activityLevel: "sedentary",
      goal: "fat_loss",
      goalWeightKg: 40, // would also fail the BMI floor — minor check must win
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("minor");
  });

  it("allows age 18 exactly", () => {
    const result = calculateTargets({
      sex: "male",
      age: 18,
      weightKg: 70,
      heightCm: 175,
      activityLevel: "moderate",
      goal: "maintenance",
    });
    expect(result.ok).toBe(true);
  });
});
