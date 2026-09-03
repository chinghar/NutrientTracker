import { describe, it, expect } from "vitest";
import { applyCalibrationToTarget, computeCalibration, computeEwma, MIN_CALIBRATION_DAYS } from "./calibration";

describe("computeEwma", () => {
  it("smooths a rising series toward the new values without matching them exactly", () => {
    const result = computeEwma(
      [
        { date: "2026-01-01", weightKg: 80 },
        { date: "2026-01-02", weightKg: 81 },
      ],
      0.25,
    );
    expect(result[0].weightKg).toBeCloseTo(80, 5);
    // 0.25*81 + 0.75*80 = 80.25
    expect(result[1].weightKg).toBeCloseTo(80.25, 5);
  });

  it("sorts unsorted input by date before smoothing", () => {
    const result = computeEwma([
      { date: "2026-01-02", weightKg: 81 },
      { date: "2026-01-01", weightKg: 80 },
    ]);
    expect(result.map((r) => r.date)).toEqual(["2026-01-01", "2026-01-02"]);
  });

  it("returns an empty array for an empty series", () => {
    expect(computeEwma([])).toEqual([]);
  });
});

describe("computeCalibration", () => {
  it("derives a positive bias (logs read low) when weight held flat despite a lower logged average than TDEE", () => {
    // Flat weight over 14 days but logs average 2000 kcal against a 2500 kcal TDEE:
    // if weight didn't change, real intake must have been ~2500, so the 2000 logged reads ~25% low.
    const result = computeCalibration({
      weightLogs: [
        { date: "2026-01-01", weightKg: 80 },
        { date: "2026-01-14", weightKg: 80 },
      ],
      avgLoggedKcal: 2000,
      days: 14,
      profileTdeeKcal: 2500,
    });
    expect(result).not.toBeNull();
    expect(result!.loggingBiasFactor).toBeCloseTo(0.25, 3);
    expect(result!.impliedMaintenanceKcal).toBeCloseTo(2000, 3);
    expect(result!.message).toMatch(/25% low/);
  });

  it("derives a negative bias (logs read high) when logged average exceeds TDEE despite flat weight", () => {
    const result = computeCalibration({
      weightLogs: [
        { date: "2026-01-01", weightKg: 80 },
        { date: "2026-01-14", weightKg: 80 },
      ],
      avgLoggedKcal: 3000,
      days: 14,
      profileTdeeKcal: 2500,
    });
    expect(result).not.toBeNull();
    expect(result!.loggingBiasFactor).toBeLessThan(0);
    expect(result!.message).toMatch(/high/);
  });

  it("returns null before the minimum calibration window has elapsed", () => {
    const result = computeCalibration({
      weightLogs: [
        { date: "2026-01-01", weightKg: 80 },
        { date: "2026-01-10", weightKg: 80 },
      ],
      avgLoggedKcal: 2000,
      days: MIN_CALIBRATION_DAYS - 1,
      profileTdeeKcal: 2500,
    });
    expect(result).toBeNull();
  });

  it("returns null with fewer than 2 weight entries", () => {
    const result = computeCalibration({
      weightLogs: [{ date: "2026-01-01", weightKg: 80 }],
      avgLoggedKcal: 2000,
      days: 14,
      profileTdeeKcal: 2500,
    });
    expect(result).toBeNull();
  });

  it("returns null when there is no logged intake to compare against", () => {
    const result = computeCalibration({
      weightLogs: [
        { date: "2026-01-01", weightKg: 80 },
        { date: "2026-01-14", weightKg: 80 },
      ],
      avgLoggedKcal: 0,
      days: 14,
      profileTdeeKcal: 2500,
    });
    expect(result).toBeNull();
  });

  it("clamps an extreme bias derived from a very small logged average", () => {
    const result = computeCalibration({
      weightLogs: [
        { date: "2026-01-01", weightKg: 80 },
        { date: "2026-01-14", weightKg: 80 },
      ],
      avgLoggedKcal: 1000,
      days: 14,
      profileTdeeKcal: 2500,
    });
    expect(result).not.toBeNull();
    expect(result!.loggingBiasFactor).toBeCloseTo(0.6, 5);
  });

  it("reports no adjustment needed when bias rounds to 0%", () => {
    const result = computeCalibration({
      weightLogs: [
        { date: "2026-01-01", weightKg: 80 },
        { date: "2026-01-14", weightKg: 80 },
      ],
      avgLoggedKcal: 2500,
      days: 14,
      profileTdeeKcal: 2500,
    });
    expect(result!.message).toMatch(/no adjustment needed/);
  });
});

describe("applyCalibrationToTarget", () => {
  it("lowers the displayed target when logs read low, so hitting it still means true intake at the original target", () => {
    // 2000 / 1.25 = 1600
    expect(applyCalibrationToTarget(2000, 0.25, 1500)).toBeCloseTo(1600, 3);
  });

  it("raises the displayed target when logs read high", () => {
    // 2000 / 0.8 = 2500
    expect(applyCalibrationToTarget(2000, -0.2, 1500)).toBeCloseTo(2500, 3);
  });

  it("never drops the adjusted target below the Phase 2 safety floor", () => {
    // 1600 / 1.25 = 1280, below the 1500 floor
    expect(applyCalibrationToTarget(1600, 0.25, 1500)).toBe(1500);
  });
});
