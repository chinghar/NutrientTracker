"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { db, getProfile, type BodyWeightLog, type LoggedMeal, type Profile } from "@/lib/db/db";
import { applyCalibrationToTarget, computeCalibration, type CalibrationResult } from "@/lib/nutrition/calibration";
import {
  computeDailyNutrientTotals,
  computeRollingAverage,
  roundToSignificantFigures,
  type NutrientSummary,
} from "@/lib/nutrition/compute";
import { daysBetween, lastNDayStrings, todayString } from "@/lib/nutrition/dates";
import { getDri } from "@/lib/nutrition/dri";
import { calculateBMR, calculateTargets, calculateTDEE, CALORIE_FLOOR, type DailyTargets } from "@/lib/nutrition/targets";

const MACRO_KEYS: { key: string; label: string }[] = [
  { key: "proteinG", label: "Protein" },
  { key: "fatG", label: "Fat" },
  { key: "carbG", label: "Carbs" },
];

export default function DashboardPage() {
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [meals, setMeals] = useState<LoggedMeal[]>([]);
  const [weightLogs, setWeightLogs] = useState<BodyWeightLog[]>([]);
  const [weightInput, setWeightInput] = useState("");

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    const [p, m, w] = await Promise.all([
      getProfile(),
      db.mealLogs.toArray(),
      db.bodyWeightLogs.orderBy("date").toArray(),
    ]);
    setProfile(p ?? null);
    setMeals(m);
    setWeightLogs(w);
  }

  async function handleLogWeight() {
    const weightKg = parseFloat(weightInput);
    if (!Number.isFinite(weightKg) || weightKg <= 0) return;
    const today = todayString();
    const existing = await db.bodyWeightLogs.where("date").equals(today).first();
    if (existing?.id != null) {
      await db.bodyWeightLogs.update(existing.id, { weightKg });
    } else {
      await db.bodyWeightLogs.add({ date: today, weightKg });
    }
    setWeightInput("");
    await refresh();
  }

  const dailyTotals = useMemo(() => computeDailyNutrientTotals(meals), [meals]);
  const today = todayString();
  const todayTotals = dailyTotals[today];
  const last7Days = useMemo(() => lastNDayStrings(7), []);
  const rollingCalories = useMemo(() => computeRollingAverage(dailyTotals, last7Days, "energyKcal"), [dailyTotals, last7Days]);

  const targetsResult = useMemo(() => {
    if (!profile) return null;
    return calculateTargets(profile);
  }, [profile]);

  const calibration: CalibrationResult | null = useMemo(() => {
    if (!profile || weightLogs.length < 2) return null;
    const span = daysBetween(weightLogs[0].date, weightLogs[weightLogs.length - 1].date);
    if (span < 14) return null;

    const daysInWindow = new Set(weightLogs.map((w) => w.date));
    let sum = 0;
    let count = 0;
    for (const day of daysInWindow) {
      const kcal = dailyTotals[day]?.energyKcal?.value;
      if (kcal != null) {
        sum += kcal;
        count++;
      }
    }
    if (count === 0) return null;

    const bmr = calculateBMR(profile);
    const profileTdeeKcal = calculateTDEE(bmr, profile.activityLevel);

    return computeCalibration({
      weightLogs: weightLogs.map((w) => ({ date: w.date, weightKg: w.weightKg })),
      avgLoggedKcal: sum / count,
      days: span,
      profileTdeeKcal,
    });
  }, [profile, weightLogs, dailyTotals]);

  const adjustedTargets: DailyTargets | null = useMemo(() => {
    if (!targetsResult?.ok || !profile) return null;
    if (!calibration) return targetsResult.targets;
    const bmr = calculateBMR(profile);
    const floor = Math.max(bmr, CALORIE_FLOOR[profile.sex]);
    const calories = Math.round(applyCalibrationToTarget(targetsResult.targets.calories, calibration.loggingBiasFactor, floor));
    return { ...targetsResult.targets, calories };
  }, [targetsResult, calibration, profile]);

  if (profile === undefined) {
    return <main className="mx-auto max-w-lg p-6 text-sm text-neutral-500">Loading…</main>;
  }

  if (profile === null) {
    return (
      <main className="mx-auto max-w-lg space-y-4 p-6">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-neutral-500">
          Set up your profile first to see daily targets.{" "}
          <Link href="/profile" className="underline">
            Go to profile
          </Link>
          .
        </p>
      </main>
    );
  }

  if (!targetsResult?.ok) {
    return (
      <main className="mx-auto max-w-lg space-y-4 p-6">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-neutral-500">
          {targetsResult?.error.message}{" "}
          <Link href="/profile" className="underline">
            Update profile
          </Link>
          .
        </p>
      </main>
    );
  }

  const targets = adjustedTargets ?? targetsResult.targets;

  return (
    <main className="mx-auto max-w-lg space-y-8 p-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>

      {calibration && <p className="text-sm text-neutral-500">{calibration.message}</p>}

      <section>
        <p className="text-xs text-neutral-500">7-day average calories</p>
        <p className="text-4xl font-semibold">
          {rollingCalories.average == null ? "—" : Math.round(rollingCalories.average)}
          <span className="ml-1 text-base font-normal text-neutral-500">/ {targets.calories} kcal</span>
        </p>
        <p className="text-xs text-neutral-400">
          {rollingCalories.daysWithData} of last 7 days logged — single-day estimates are noisy, this average is more reliable.
        </p>
      </section>

      <section className="space-y-2 rounded border border-neutral-200 p-4 dark:border-neutral-800">
        <p className="text-xs text-neutral-500">Today</p>
        <NutrientBar label="Calories" value={todayTotals?.energyKcal?.value ?? null} target={targets.calories} />
        {MACRO_KEYS.map(({ key, label }) => (
          <NutrientBar
            key={key}
            label={label}
            value={todayTotals?.[key]?.value ?? null}
            target={targets[key as "proteinG" | "fatG" | "carbG"]}
          />
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Log bodyweight</h2>
        <div className="flex items-center gap-2">
          <input
            type="number"
            step={0.1}
            value={weightInput}
            onChange={(e) => setWeightInput(e.target.value)}
            placeholder="kg"
            className="w-24 rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <button
            type="button"
            onClick={handleLogWeight}
            className="rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700"
          >
            Log weight
          </button>
        </div>
      </section>

      <details className="rounded border border-neutral-200 p-3 text-sm dark:border-neutral-800">
        <summary className="cursor-pointer font-medium">Micronutrients today</summary>
        <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto">
          {Object.keys(todayTotals ?? {})
            .filter((key) => getDri(key, profile.sex, profile.age) !== undefined)
            .map((key) => (
              <MicronutrientRow key={key} nutrientKey={key} summary={todayTotals![key]} sex={profile.sex} age={profile.age} />
            ))}
          {!todayTotals && <li className="text-neutral-400">Nothing logged today yet.</li>}
        </ul>
      </details>
    </main>
  );
}

function NutrientBar({ label, value, target }: { label: string; value: number | null; target: number }) {
  const pct = value == null || target <= 0 ? 0 : Math.min(100, (value / target) * 100);
  const over = value != null && value > target;
  return (
    <div>
      <div className="flex justify-between text-xs text-neutral-500">
        <span>{label}</span>
        <span>
          {value == null ? "—" : Math.round(value)} / {Math.round(target)}
        </span>
      </div>
      <div className="h-2 rounded-full bg-neutral-100 dark:bg-neutral-800">
        <div className="h-2 rounded-full bg-neutral-600 dark:bg-neutral-300" style={{ width: `${pct}%` }} />
      </div>
      {over && <p className="text-xs text-neutral-400">Over today&apos;s target — just information, no penalty.</p>}
    </div>
  );
}

function MicronutrientRow({
  nutrientKey,
  summary,
  sex,
  age,
}: {
  nutrientKey: string;
  summary: NutrientSummary;
  sex: Profile["sex"];
  age: number;
}) {
  const dri = getDri(nutrientKey, sex, age);
  if (!dri) return null;
  const value = summary.value;
  const pct = value == null ? null : (value / dri.rda) * 100;
  const nearUL = dri.ul != null && value != null && value >= dri.ul * 0.9;
  const overUL = dri.ul != null && value != null && value >= dri.ul;

  return (
    <li className="flex items-center justify-between">
      <span className="text-neutral-500">{nutrientKey}</span>
      <span>
        {value == null ? "—" : `${roundToSignificantFigures(pct!, 2)}% RDA`}
        {summary.lowConfidence && (
          <span className="ml-1 text-amber-500" title="Low confidence">
            ●
          </span>
        )}
        {(overUL || nearUL) && (
          <span className="ml-1 text-amber-500" title={overUL ? "At or above the upper intake limit" : "Approaching the upper intake limit"}>
            ⚠
          </span>
        )}
      </span>
    </li>
  );
}
