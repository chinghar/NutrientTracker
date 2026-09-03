"use client";

import { useEffect, useMemo, useState } from "react";
import { getProfile, getSettings, saveProfile, saveSettings, type Profile, type Settings } from "@/lib/db/db";
import {
  ACTIVITY_FACTORS,
  calculateTargets,
  type ActivityLevel,
  type Goal,
  type TargetsInput,
} from "@/lib/nutrition/targets";
import type { Sex } from "@/lib/nutrition/dri";

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: "Sedentary (little/no exercise)",
  light: "Light (1-3 days/week)",
  moderate: "Moderate (3-5 days/week)",
  heavy: "Heavy (6-7 days/week)",
  athlete: "Athlete (2x/day)",
};

const GOAL_LABELS: Record<Goal, string> = {
  fat_loss: "Fat loss",
  muscle_gain: "Muscle gain",
  maintenance: "Maintenance",
  recomposition: "Recomposition",
};

const INPUT_CLASS = "w-full rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";

const DEFAULTS: Omit<Profile, "id"> = {
  sex: "male",
  age: 30,
  weightKg: 75,
  heightCm: 175,
  activityLevel: "moderate",
  goal: "maintenance",
  intensity: 0.5,
};

export default function ProfilePage() {
  const [form, setForm] = useState<Omit<Profile, "id">>(DEFAULTS);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved">("idle");

  useEffect(() => {
    Promise.all([getProfile(), getSettings()]).then(([profile, loadedSettings]) => {
      if (profile) setForm(profile);
      setSettings(loadedSettings);
      setLoaded(true);
    });
  }, []);

  const targetsInput: TargetsInput = useMemo(
    () => ({
      sex: form.sex,
      age: form.age,
      weightKg: form.weightKg,
      heightCm: form.heightCm,
      bodyFatPercent: form.bodyFatPercent,
      activityLevel: form.activityLevel,
      goal: form.goal,
      goalWeightKg: form.goalWeightKg,
      intensity: form.intensity,
    }),
    [form],
  );

  const result = useMemo(() => calculateTargets(targetsInput), [targetsInput]);

  const showEatingDisorderCard =
    result.ok && result.targets.showEatingDisorderResourceCard && settings != null && !settings.eatingDisorderCardShown;

  useEffect(() => {
    if (showEatingDisorderCard) {
      saveSettings({ eatingDisorderCardShown: true }).then(() => {
        setSettings((prev) => (prev ? { ...prev, eatingDisorderCardShown: true } : prev));
      });
    }
  }, [showEatingDisorderCard]);

  function update<K extends keyof Omit<Profile, "id">>(key: K, value: Omit<Profile, "id">[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!result.ok) return;
    await saveProfile(form);
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
  }

  if (!loaded) {
    return <main className="mx-auto max-w-lg p-6 text-sm text-neutral-500">Loading…</main>;
  }

  return (
    <main className="mx-auto max-w-lg space-y-8 p-6">
      <h1 className="text-xl font-semibold">Your profile</h1>

      <section className="space-y-3">
        <div className="flex gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={form.sex === "male"} onChange={() => update("sex", "male" as Sex)} />
            Male
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={form.sex === "female"} onChange={() => update("sex", "female" as Sex)} />
            Female
          </label>
        </div>

        <Field label="Age (years)">
          <input
            type="number"
            value={form.age}
            onChange={(e) => update("age", Number(e.target.value))}
            className={INPUT_CLASS}
          />
        </Field>

        <Field label="Weight (kg)">
          <input
            type="number"
            step={0.1}
            value={form.weightKg}
            onChange={(e) => update("weightKg", Number(e.target.value))}
            className={INPUT_CLASS}
          />
        </Field>

        <Field label="Height (cm)">
          <input
            type="number"
            value={form.heightCm}
            onChange={(e) => update("heightCm", Number(e.target.value))}
            className={INPUT_CLASS}
          />
        </Field>

        <Field label="Body fat % (optional — enables Katch-McArdle BMR)">
          <input
            type="number"
            step={0.1}
            value={form.bodyFatPercent ?? ""}
            onChange={(e) => update("bodyFatPercent", e.target.value ? Number(e.target.value) : undefined)}
            className={INPUT_CLASS}
          />
        </Field>

        <Field label="Activity level">
          <select
            value={form.activityLevel}
            onChange={(e) => update("activityLevel", e.target.value as ActivityLevel)}
            className={INPUT_CLASS}
          >
            {Object.keys(ACTIVITY_FACTORS).map((level) => (
              <option key={level} value={level}>
                {ACTIVITY_LABELS[level as ActivityLevel]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Goal">
          <select value={form.goal} onChange={(e) => update("goal", e.target.value as Goal)} className={INPUT_CLASS}>
            {Object.entries(GOAL_LABELS).map(([goal, label]) => (
              <option key={goal} value={goal}>
                {label}
              </option>
            ))}
          </select>
        </Field>

        {(form.goal === "fat_loss" || form.goal === "muscle_gain") && (
          <Field label="Goal weight (kg, optional)">
            <input
              type="number"
              step={0.1}
              value={form.goalWeightKg ?? ""}
              onChange={(e) => update("goalWeightKg", e.target.value ? Number(e.target.value) : undefined)}
              className={INPUT_CLASS}
            />
          </Field>
        )}

        {form.goal !== "maintenance" && form.goal !== "recomposition" && (
          <Field label={`Intensity within the recommended range (${Math.round((form.intensity ?? 0.5) * 100)}%)`}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={form.intensity ?? 0.5}
              onChange={(e) => update("intensity", Number(e.target.value))}
              className="w-full"
            />
          </Field>
        )}
      </section>

      {!result.ok && result.error.type === "minor" && (
        <div className="rounded border border-neutral-300 p-4 text-sm dark:border-neutral-700">{result.error.message}</div>
      )}

      {!result.ok && result.error.type === "bmi_floor" && (
        <div className="rounded border border-neutral-300 p-4 text-sm dark:border-neutral-700">{result.error.message}</div>
      )}

      {result.ok && (
        <section className="space-y-3 rounded border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="text-sm font-medium">Your daily targets</h2>
          <p className="text-2xl font-semibold">{result.targets.calories} kcal</p>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div>Protein: {result.targets.proteinG} g</div>
            <div>Fat: {result.targets.fatG} g</div>
            <div>Carbs: {result.targets.carbG} g</div>
            <div>Fiber: {result.targets.fiberG} g</div>
          </div>
          {result.targets.clamped && <p className="text-sm text-neutral-500">{result.targets.clampReason}</p>}
        </section>
      )}

      {showEatingDisorderCard && (
        <div className="rounded border border-neutral-300 p-4 text-sm dark:border-neutral-700">
          <p>
            The plan you&apos;ve entered involves a significant calorie reduction. If eating, weight, or body image
            feel like a struggle right now, the National Alliance for Eating Disorders offers free, confidential
            support: <span className="font-medium">1-866-662-1235</span>.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={!result.ok}
        className="rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
      >
        Save profile
      </button>
      {saveStatus === "saved" && <span className="ml-3 text-sm text-neutral-500">Saved.</span>}

    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm text-neutral-500">{label}</span>
      {children}
    </label>
  );
}
