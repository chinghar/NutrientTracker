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
import Button from "@/components/ui/Button";
import Rule from "@/components/ui/Rule";

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

const INPUT_CLASS = "w-full min-h-11 rounded-lg border-2 border-toast/40 bg-white px-3 py-2 text-base text-cocoa";

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
    return <main className="mx-auto max-w-lg p-6 text-sm text-toast">Loading…</main>;
  }

  return (
    <main className="mx-auto max-w-lg space-y-8 p-6">
      <h1 className="font-display text-3xl">Your profile</h1>

      <section className="space-y-4">
        <div className="flex gap-4">
          <label className="flex min-h-11 items-center gap-2 text-base">
            <input type="radio" checked={form.sex === "male"} onChange={() => update("sex", "male" as Sex)} className="h-5 w-5" />
            Male
          </label>
          <label className="flex min-h-11 items-center gap-2 text-base">
            <input
              type="radio"
              checked={form.sex === "female"}
              onChange={() => update("sex", "female" as Sex)}
              className="h-5 w-5"
            />
            Female
          </label>
        </div>

        <Field label="Age (years)" required>
          <input
            type="number"
            value={form.age}
            onChange={(e) => update("age", Number(e.target.value))}
            className={INPUT_CLASS}
          />
        </Field>

        <Field label="Weight (kg)" required>
          <input
            type="number"
            step={0.1}
            value={form.weightKg}
            onChange={(e) => update("weightKg", Number(e.target.value))}
            className={INPUT_CLASS}
          />
        </Field>

        <Field label="Height (cm)" required>
          <input
            type="number"
            value={form.heightCm}
            onChange={(e) => update("heightCm", Number(e.target.value))}
            className={INPUT_CLASS}
          />
        </Field>

        <Field
          label="Body fat %"
          required={false}
          hint="Switches the calorie calculation to a lean-mass basis, which is more accurate than weight alone."
        >
          <input
            type="number"
            step={0.1}
            value={form.bodyFatPercent ?? ""}
            onChange={(e) => update("bodyFatPercent", e.target.value ? Number(e.target.value) : undefined)}
            className={INPUT_CLASS}
          />
        </Field>

        <Field label="Activity level" required>
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

        <Field label="Goal" required>
          <select value={form.goal} onChange={(e) => update("goal", e.target.value as Goal)} className={INPUT_CLASS}>
            {Object.entries(GOAL_LABELS).map(([goal, label]) => (
              <option key={goal} value={goal}>
                {label}
              </option>
            ))}
          </select>
        </Field>

        {(form.goal === "fat_loss" || form.goal === "muscle_gain") && (
          <Field label="Goal weight (kg)" required={false}>
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
          <Field
            label={`Intensity within the recommended range (${Math.round((form.intensity ?? 0.5) * 100)}%)`}
            required={false}
          >
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={form.intensity ?? 0.5}
              onChange={(e) => update("intensity", Number(e.target.value))}
              className="h-11 w-full accent-poppy"
            />
          </Field>
        )}
      </section>

      {!result.ok && (result.error.type === "minor" || result.error.type === "bmi_floor") && (
        <div className="border-l-4 border-toast bg-white p-4 text-sm text-cocoa">{result.error.message}</div>
      )}

      {result.ok && (
        <section className="space-y-3">
          <Rule color="avocado" />
          <h2 className="text-sm font-bold">Your daily targets</h2>
          <p className="font-display text-4xl">{result.targets.calories} kcal</p>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div>Protein: {result.targets.proteinG} g</div>
            <div>Fat: {result.targets.fatG} g</div>
            <div>Carbs: {result.targets.carbG} g</div>
            <div>Fiber: {result.targets.fiberG} g</div>
          </div>
          {result.targets.clamped && <p className="text-sm text-toast">{result.targets.clampReason}</p>}
        </section>
      )}

      {showEatingDisorderCard && (
        <div className="border-l-4 border-toast bg-white p-4 text-sm text-cocoa">
          <p>
            The plan you&apos;ve entered involves a significant calorie reduction. If eating, weight, or body image
            feel like a struggle right now, the National Alliance for Eating Disorders offers free, confidential
            support: <span className="font-bold">1-866-662-1235</span>.
          </p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="button" variant="primary" onClick={handleSave} disabled={!result.ok}>
          Save profile
        </Button>
        {saveStatus === "saved" && <span className="text-sm font-semibold text-cocoa">Saved.</span>}
      </div>
    </main>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-semibold text-cocoa">
        {label} <span className="text-xs font-normal text-toast">({required ? "required" : "optional"})</span>
      </span>
      {children}
      {hint && <span className="block text-xs text-toast">{hint}</span>}
    </label>
  );
}
