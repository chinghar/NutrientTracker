import { z } from "zod";
import { db, getProfile, getSettings, saveProfile, saveSettings, type BodyWeightLog, type LoggedMeal } from "./db";

const loggedMealItemSchema = z.object({
  name: z.string(),
  grams: z.number(),
  confidence: z.number(),
  nutrientsPer100g: z.record(z.string(), z.number().nullable()),
  source: z.enum(["usda", "openfoodfacts", "manual"]),
});

const loggedMealSchema = z.object({
  id: z.number().optional(),
  loggedAt: z.string(),
  items: z.array(loggedMealItemSchema),
});

const bodyWeightLogSchema = z.object({
  id: z.number().optional(),
  date: z.string(),
  weightKg: z.number(),
});

const profileSchema = z.object({
  sex: z.enum(["male", "female"]),
  age: z.number(),
  weightKg: z.number(),
  heightCm: z.number(),
  bodyFatPercent: z.number().optional(),
  activityLevel: z.enum(["sedentary", "light", "moderate", "heavy", "athlete"]),
  goal: z.enum(["fat_loss", "muscle_gain", "maintenance", "recomposition"]),
  goalWeightKg: z.number().optional(),
  intensity: z.number().optional(),
});

const exportSchema = z.object({
  exportedAt: z.string(),
  version: z.number(),
  // Deliberately excludes the API key — it must never be written to a file.
  settings: z.object({
    visionProvider: z.enum(["anthropic", "ollama"]),
    plateDiameterCm: z.number().optional(),
  }),
  profile: profileSchema.optional(),
  mealLogs: z.array(loggedMealSchema),
  // Optional/defaulted so a file exported before bodyweight tracking existed still imports cleanly.
  bodyWeightLogs: z.array(bodyWeightLogSchema).optional().default([]),
});

export type ExportedData = z.infer<typeof exportSchema>;

const EXPORT_VERSION = 2;

/** With no server, this JSON file is the user's only backup — it deliberately omits the API key. */
export async function exportAllData(): Promise<ExportedData> {
  const [settings, profile, mealLogs, bodyWeightLogs] = await Promise.all([
    getSettings(),
    getProfile(),
    db.mealLogs.toArray(),
    db.bodyWeightLogs.toArray(),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    version: EXPORT_VERSION,
    settings: { visionProvider: settings.visionProvider, plateDiameterCm: settings.plateDiameterCm },
    profile: profile
      ? {
          sex: profile.sex,
          age: profile.age,
          weightKg: profile.weightKg,
          heightCm: profile.heightCm,
          bodyFatPercent: profile.bodyFatPercent,
          activityLevel: profile.activityLevel,
          goal: profile.goal,
          goalWeightKg: profile.goalWeightKg,
          intensity: profile.intensity,
        }
      : undefined,
    mealLogs,
    bodyWeightLogs,
  };
}

/** Pure validation, kept separate from the Dexie I/O below so it's unit-testable without an IndexedDB polyfill. */
export function parseExportedData(json: string): ExportedData {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }

  const parsed = exportSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("That file isn't a valid nutrition-app export.");
  }
  return parsed.data;
}

/** Restores settings (except the API key, which the user re-enters), profile, meal logs, and bodyweight logs from an exported JSON file. */
export async function importAllData(json: string): Promise<{ mealCount: number; weightLogCount: number }> {
  const data = parseExportedData(json);
  await saveSettings({ visionProvider: data.settings.visionProvider, plateDiameterCm: data.settings.plateDiameterCm });
  if (data.profile) await saveProfile(data.profile);
  await db.mealLogs.bulkPut(data.mealLogs as LoggedMeal[]);
  await db.bodyWeightLogs.bulkPut(data.bodyWeightLogs as BodyWeightLog[]);
  return { mealCount: data.mealLogs.length, weightLogCount: data.bodyWeightLogs.length };
}
