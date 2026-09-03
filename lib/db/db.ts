import Dexie, { type Table } from "dexie";
import type { Sex } from "@/lib/nutrition/dri";
import type { ActivityLevel, Goal } from "@/lib/nutrition/targets";

export type VisionProviderId = "anthropic" | "ollama";

export interface Settings {
  /** Singleton row id — there is only ever one settings record. */
  id: "app";
  anthropicApiKey?: string;
  visionProvider: VisionProviderId;
  /** Default plate diameter in cm, passed to the vision provider as a scale hint. */
  plateDiameterCm?: number;
  /** Whether the calm eating-disorder-resource card has already been shown once. */
  eatingDisorderCardShown?: boolean;
}

const DEFAULT_SETTINGS: Settings = { id: "app", visionProvider: "anthropic" };

/** Where a logged item's food data came from. */
export type MealItemSource = "usda" | "openfoodfacts" | "manual";

export interface LoggedMealItem {
  name: string;
  grams: number;
  /** 0-1. 1 for barcode/manual entries (exact match, no vision estimation). */
  confidence: number;
  /** Per-100g nutrient snapshot at logging time, so history is stable even if the food DB is later regenerated. */
  nutrientsPer100g: Record<string, number | null>;
  source: MealItemSource;
}

export interface LoggedMeal {
  id?: number;
  loggedAt: string;
  items: LoggedMealItem[];
}

/** Cached copy of a public/data/*.json file, so repeat sessions don't refetch it. */
export interface FoodDbCacheEntry {
  key: string;
  cacheVersion: number;
  json: string;
}

/** The user's body stats and goal — inputs to lib/nutrition/targets.ts, not the derived targets themselves. */
export interface Profile {
  /** Singleton row id — there is only ever one profile record. */
  id: "app";
  sex: Sex;
  age: number;
  weightKg: number;
  heightCm: number;
  bodyFatPercent?: number;
  activityLevel: ActivityLevel;
  goal: Goal;
  goalWeightKg?: number;
  intensity?: number;
}

export interface BodyWeightLog {
  id?: number;
  /** YYYY-MM-DD */
  date: string;
  weightKg: number;
}

class NutritionDB extends Dexie {
  settings!: Table<Settings, string>;
  mealLogs!: Table<LoggedMeal, number>;
  foodDbCache!: Table<FoodDbCacheEntry, string>;
  profile!: Table<Profile, string>;
  bodyWeightLogs!: Table<BodyWeightLog, number>;

  constructor() {
    super("nutrition-app");
    this.version(1).stores({
      settings: "id",
    });
    this.version(2).stores({
      settings: "id",
      mealLogs: "++id, loggedAt",
      foodDbCache: "key",
    });
    this.version(3).stores({
      settings: "id",
      mealLogs: "++id, loggedAt",
      foodDbCache: "key",
      profile: "id",
      bodyWeightLogs: "++id, date",
    });
  }
}

export const db = new NutritionDB();

export async function getSettings(): Promise<Settings> {
  const existing = await db.settings.get("app");
  return existing ?? DEFAULT_SETTINGS;
}

export async function saveSettings(patch: Partial<Omit<Settings, "id">>): Promise<void> {
  const current = await getSettings();
  await db.settings.put({ ...current, ...patch, id: "app" });
}

export async function getProfile(): Promise<Profile | undefined> {
  return db.profile.get("app");
}

export async function saveProfile(profile: Omit<Profile, "id">): Promise<void> {
  await db.profile.put({ ...profile, id: "app" });
}
