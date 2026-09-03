"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { useSetupStatus } from "@/lib/onboarding/status";
import HeroBadge from "@/components/HeroBadge";
import Button from "@/components/ui/Button";
import Rule from "@/components/ui/Rule";

const MACRO_KEYS: { key: string; label: string }[] = [
  { key: "proteinG", label: "Protein" },
  { key: "fatG", label: "Fat" },
  { key: "carbG", label: "Carbs" },
];

export default function DashboardPage() {
  const router = useRouter();
  const setupStatus = useSetupStatus();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [meals, setMeals] = useState<LoggedMeal[]>([]);
  const [weightLogs, setWeightLogs] = useState<BodyWeightLog[]>([]);
  const [weightInput, setWeightInput] = useState("");

  useEffect(() => {
    if (!setupStatus.loading && !setupStatus.isReady) {
      router.replace("/");
    }
  }, [setupStatus, router]);

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

  if (setupStatus.loading || !setupStatus.isReady || profile === undefined) {
    return <main className="mx-auto max-w-lg p-6 text-sm text-toast">Loading…</main>;
  }

  if (profile === null) {
    return (
      <main className="mx-auto max-w-lg space-y-4 p-6">
        <h1 className="font-display text-3xl">Dashboard</h1>
        <p className="text-sm text-toast">
          Set up your profile first to see daily targets.{" "}
          <Link href="/profile" className="font-semibold text-cocoa underline underline-offset-2">
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
        <h1 className="font-display text-3xl">Dashboard</h1>
        <p className="text-sm text-toast">
          {targetsResult?.error.message}{" "}
          <Link href="/profile" className="font-semibold text-cocoa underline underline-offset-2">
            Update profile
          </Link>
          .
        </p>
      </main>
    );
  }

  const targets = adjustedTargets ?? targetsResult.targets;
  const heroPercent = rollingCalories.average == null ? 0 : (rollingCalories.average / targets.calories) * 100;

  return (
    <main className="mx-auto max-w-lg space-y-10 p-6">
      <h1 className="font-display text-3xl">Dashboard</h1>

      {calibration && <p className="text-sm text-cocoa">{calibration.message}</p>}

      {/* The one hero element on the app: the 7-day rolling average, visually dominant
          over today's single-day number below it — single-meal estimates are noisy,
          weekly averages are not, and that hierarchy is a correctness decision. */}
      <section className="space-y-2 text-center">
        <HeroBadge
          value={rollingCalories.average == null ? "—" : String(Math.round(rollingCalories.average))}
          captionLines={[`of ${targets.calories} kcal target`, "7-day average"]}
          percent={heroPercent}
        />
        <p className="text-sm text-toast">
          {rollingCalories.daysWithData} of last 7 days logged — single-day estimates are noisy, this average is more
          reliable.
        </p>
      </section>

      <Rule color="toast" />

      <section className="space-y-3">
        <p className="text-xs font-bold text-toast">Today</p>
        {!todayTotals && (
          <p className="text-sm text-toast">
            <Link href="/log" className="font-semibold text-cocoa underline underline-offset-2">
              Photograph, scan, or search for your first meal today
            </Link>{" "}
            to see it here.
          </p>
        )}
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
        <h2 className="text-sm font-bold">Log bodyweight</h2>
        <div className="flex items-center gap-3">
          <input
            type="number"
            step={0.1}
            value={weightInput}
            onChange={(e) => setWeightInput(e.target.value)}
            placeholder="kg"
            className="min-h-11 w-24 rounded-lg border-2 border-toast/40 bg-white px-3 py-2 text-base text-cocoa"
          />
          <Button type="button" variant="outline" onClick={handleLogWeight}>
            Log weight
          </Button>
        </div>
      </section>

      <Rule color="avocado" />

      <details>
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-bold">Micronutrients today</summary>
        <ul className="mt-2 max-h-80 divide-y divide-toast/15 overflow-y-auto text-sm">
          {Object.keys(todayTotals ?? {})
            .filter((key) => getDri(key, profile.sex, profile.age) !== undefined)
            .map((key) => (
              <MicronutrientRow key={key} nutrientKey={key} summary={todayTotals![key]} sex={profile.sex} age={profile.age} />
            ))}
          {!todayTotals && (
            <li className="py-2 text-toast">
              <Link href="/log" className="font-semibold text-cocoa underline underline-offset-2">
                Log a meal
              </Link>{" "}
              to fill this in.
            </li>
          )}
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
      <div className="flex justify-between text-sm text-cocoa">
        <span className="font-semibold">{label}</span>
        <span>
          {value == null ? "—" : Math.round(value)} / {Math.round(target)}
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-toast/15">
        <div className="h-2.5 rounded-full bg-marigold" style={{ width: `${pct}%` }} />
      </div>
      {/* Over target renders in Toast — the deliberate calm neutral, never red/alarm-coded. */}
      {over && <p className="text-xs text-toast">Over today&apos;s target — just information, no penalty.</p>}
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
    <li className="flex items-center justify-between py-1.5">
      <span className="text-toast">{nutrientKey}</span>
      <span className="font-semibold tabular-nums text-cocoa">
        {value == null ? "—" : `${roundToSignificantFigures(pct!, 2)}% RDA`}
        {summary.lowConfidence && (
          <span className="ml-1 font-normal text-toast" title="Low confidence">
            ●
          </span>
        )}
        {(overUL || nearUL) && (
          <span
            className="ml-1 text-poppy"
            title={overUL ? "At or above the upper intake limit" : "Approaching the upper intake limit"}
          >
            ⚠
          </span>
        )}
      </span>
    </li>
  );
}
