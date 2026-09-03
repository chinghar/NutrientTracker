import MiniSearch from "minisearch";
import { db } from "@/lib/db/db";
import type { FoodDbData, FoodRecord } from "./types";

/** Bump this if public/data/foods.json's shape changes, to force cached IndexedDB copies to refetch. */
const CACHE_VERSION = 1;

const MINISEARCH_OPTIONS = { idField: "id", fields: ["name"], storeFields: ["name"] };

export interface FoodDb {
  data: FoodDbData;
  search: MiniSearch;
}

let loadPromise: Promise<FoodDb> | null = null;

function build(foodsText: string, indexText: string): FoodDb {
  const data = JSON.parse(foodsText) as FoodDbData;
  const search = MiniSearch.loadJSON(indexText, MINISEARCH_OPTIONS);
  return { data, search };
}

async function fetchAndCache(): Promise<FoodDb> {
  const [foodsRes, indexRes] = await Promise.all([fetch("/data/foods.json"), fetch("/data/foods-search-index.json")]);
  if (!foodsRes.ok || !indexRes.ok) {
    throw new Error("Failed to load the food database.");
  }
  const [foodsText, indexText] = await Promise.all([foodsRes.text(), indexRes.text()]);

  await db.foodDbCache.bulkPut([
    { key: "foods", cacheVersion: CACHE_VERSION, json: foodsText },
    { key: "searchIndex", cacheVersion: CACHE_VERSION, json: indexText },
  ]);

  return build(foodsText, indexText);
}

/** Loads the food database once per session: from IndexedDB if cached, otherwise fetched and then cached. */
export function loadFoodDb(): Promise<FoodDb> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const [foodsEntry, indexEntry] = await Promise.all([db.foodDbCache.get("foods"), db.foodDbCache.get("searchIndex")]);
    if (foodsEntry?.cacheVersion === CACHE_VERSION && indexEntry?.cacheVersion === CACHE_VERSION) {
      try {
        return build(foodsEntry.json, indexEntry.json);
      } catch {
        // Cached copy is corrupt/unreadable — fall through and refetch.
      }
    }
    return fetchAndCache();
  })().catch((err) => {
    loadPromise = null; // allow retrying on the next call after a failure
    throw err;
  });
  return loadPromise;
}

export function getFoodByIndex(data: FoodDbData, index: number): FoodRecord {
  const nutrients: Record<string, number | null> = {};
  for (const key of Object.keys(data.nutrients)) nutrients[key] = data.nutrients[key][index];
  return {
    index,
    fdcId: data.ids[index],
    name: data.names[index],
    source: data.sources[index],
    nutrients,
  };
}

export function searchFoods(foodDb: FoodDb, query: string, limit = 10): FoodRecord[] {
  if (!query.trim()) return [];
  const results = foodDb.search.search(query, { prefix: true, fuzzy: 0.2 });
  return results.slice(0, limit).map((r) => getFoodByIndex(foodDb.data, r.id as number));
}
