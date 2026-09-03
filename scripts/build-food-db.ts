/**
 * Builds public/data/foods.json and public/data/foods-search-index.json from the
 * USDA FoodData Central bulk CSV release. Run manually via `pnpm build:fooddb`.
 * This does NOT run at Vercel build time or app runtime — the two output files
 * it produces are committed to the repo, and that's what makes the Vercel build
 * a no-op for nutrition data.
 *
 * Source datasets (current as of Sep 2026 — check https://fdc.nal.usda.gov/download-datasets
 * for newer releases if these URLs 404):
 *   Foundation Foods: https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_csv_2025-12-18.zip
 *   SR Legacy:        https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip
 *
 * Requires the `unzip` CLI on PATH (present by default on macOS/Linux dev machines).
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import MiniSearch from "minisearch";

const CACHE_DIR = join(__dirname, ".cache");
const OUT_DIR = join(__dirname, "..", "public", "data");

const SOURCES = {
  foundation: {
    url: "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_csv_2025-12-18.zip",
    zip: join(CACHE_DIR, "foundation.zip"),
    dir: join(CACHE_DIR, "foundation"),
    dataType: "foundation_food",
    source: 0 as const, // 0 = foundation, 1 = sr_legacy (parallel "sources" array in output)
  },
  srLegacy: {
    url: "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip",
    zip: join(CACHE_DIR, "sr_legacy.zip"),
    dir: join(CACHE_DIR, "sr_legacy"),
    dataType: "sr_legacy_food",
    source: 1 as const,
  },
};

// Each target nutrient, mapped to its USDA nutrient_id(s) in priority order.
// Multiple datasets/foods populate different ids for the "same" nutrient
// (e.g. Foundation Foods mostly lack id 1008 for Energy and report 2048/2047
// instead); the first id present for a given food wins.
const NUTRIENT_CONFIG: { key: string; unit: "KCAL" | "G" | "MG" | "UG"; ids: number[] }[] = [
  { key: "energyKcal", unit: "KCAL", ids: [1008, 2048, 2047] },
  { key: "proteinG", unit: "G", ids: [1003] },
  { key: "fatG", unit: "G", ids: [1004, 1085] },
  { key: "satFatG", unit: "G", ids: [1258] },
  { key: "carbG", unit: "G", ids: [1005, 1050] },
  { key: "fiberG", unit: "G", ids: [1079] },
  { key: "sugarG", unit: "G", ids: [2000, 1063] },
  { key: "sodiumMg", unit: "MG", ids: [1093] },
  { key: "potassiumMg", unit: "MG", ids: [1092] },
  { key: "calciumMg", unit: "MG", ids: [1087] },
  { key: "ironMg", unit: "MG", ids: [1089] },
  { key: "magnesiumMg", unit: "MG", ids: [1090] },
  { key: "zincMg", unit: "MG", ids: [1095] },
  { key: "seleniumUg", unit: "UG", ids: [1103] },
  { key: "phosphorusMg", unit: "MG", ids: [1091] },
  { key: "copperMg", unit: "MG", ids: [1098] },
  { key: "manganeseMg", unit: "MG", ids: [1101] },
  { key: "vitAUg", unit: "UG", ids: [1106] },
  { key: "vitCMg", unit: "MG", ids: [1162] },
  { key: "vitDUg", unit: "UG", ids: [1114] },
  { key: "vitEMg", unit: "MG", ids: [1109] },
  { key: "vitKUg", unit: "UG", ids: [1185] },
  { key: "thiaminMg", unit: "MG", ids: [1165] },
  { key: "riboflavinMg", unit: "MG", ids: [1166] },
  { key: "niacinMg", unit: "MG", ids: [1167] },
  { key: "vitB6Mg", unit: "MG", ids: [1175] },
  { key: "folateUg", unit: "UG", ids: [1190, 1177] },
  { key: "vitB12Ug", unit: "UG", ids: [1178] },
  { key: "cholineMg", unit: "MG", ids: [1180] },
];

const ROUND_DECIMALS: Record<string, number> = { KCAL: 0, G: 2, MG: 2, UG: 1 };

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/** Minimal RFC 4180 CSV parser: handles quoted fields, escaped "" quotes, and
 * embedded commas/newlines inside quoted fields. USDA CSVs always quote every field. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const len = text.length;
  while (i < len) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Parses a CSV file into an array of objects keyed by its header row. */
function parseCsvFile(path: string): Record<string, string>[] {
  const text = readFileSync(path, "utf-8");
  const rows = parseCsv(text);
  const header = rows[0];
  const records: Record<string, string>[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length === 1 && row[0] === "") continue; // trailing blank line
    const record: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) record[header[j]] = row[j] ?? "";
    records.push(record);
  }
  return records;
}

/** Recursively finds a file by exact name under a directory. */
function findFile(dir: string, name: string): string {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      try {
        return findFile(full, name);
      } catch {
        // not in this subtree, keep looking
      }
    } else if (entry === name) {
      return full;
    }
  }
  throw new Error(`${name} not found under ${dir}`);
}

function ensureDataset(spec: (typeof SOURCES)[keyof typeof SOURCES]): void {
  if (existsSync(spec.dir) && readdirSync(spec.dir).length > 0) {
    console.log(`  cached: ${spec.dir}`);
    return;
  }
  mkdirSync(CACHE_DIR, { recursive: true });
  if (!existsSync(spec.zip)) {
    console.log(`  downloading ${spec.url}`);
    execSync(`curl -sL -o "${spec.zip}" "${spec.url}"`, { stdio: "inherit" });
  }
  mkdirSync(spec.dir, { recursive: true });
  console.log(`  extracting ${spec.zip}`);
  execSync(`unzip -o -q "${spec.zip}" -d "${spec.dir}"`);
}

interface FoodRecord {
  fdcId: number;
  name: string;
  source: 0 | 1;
  nutrients: Record<string, number | null>;
}

function loadDataset(spec: (typeof SOURCES)[keyof typeof SOURCES]): FoodRecord[] {
  const foodCsv = findFile(spec.dir, "food.csv");
  const nutrientCsv = findFile(spec.dir, "food_nutrient.csv");

  const foods = parseCsvFile(foodCsv).filter((r) => r.data_type === spec.dataType);
  const keepIds = new Set(foods.map((f) => f.fdc_id));

  // fdc_id -> nutrient_id -> amount
  const nutrientMap = new Map<string, Map<number, number>>();
  const nutrientRows = parseCsvFile(nutrientCsv);
  for (const row of nutrientRows) {
    if (!keepIds.has(row.fdc_id)) continue;
    const amount = parseFloat(row.amount);
    if (!Number.isFinite(amount)) continue;
    const nutrientId = parseInt(row.nutrient_id, 10);
    let byNutrient = nutrientMap.get(row.fdc_id);
    if (!byNutrient) {
      byNutrient = new Map();
      nutrientMap.set(row.fdc_id, byNutrient);
    }
    // food_nutrient.csv can list the same nutrient_id more than once for a
    // food (rare, lab-replicate rows); keep the first occurrence.
    if (!byNutrient.has(nutrientId)) byNutrient.set(nutrientId, amount);
  }

  return foods.map((f) => {
    const byNutrient = nutrientMap.get(f.fdc_id);
    const nutrients: Record<string, number | null> = {};
    for (const cfg of NUTRIENT_CONFIG) {
      let value: number | null = null;
      if (byNutrient) {
        for (const id of cfg.ids) {
          const amount = byNutrient.get(id);
          if (amount !== undefined) {
            value = round(amount, ROUND_DECIMALS[cfg.unit]);
            break;
          }
        }
      }
      nutrients[cfg.key] = value;
    }
    return {
      fdcId: parseInt(f.fdc_id, 10),
      name: f.description.replace(/\s+/g, " ").trim(),
      source: spec.source,
      nutrients,
    };
  });
}

function main() {
  console.log("Fetching USDA FoodData Central bulk datasets...");
  console.log("Foundation Foods:");
  ensureDataset(SOURCES.foundation);
  console.log("SR Legacy:");
  ensureDataset(SOURCES.srLegacy);

  console.log("\nParsing CSVs...");
  const foundationFoods = loadDataset(SOURCES.foundation);
  const srLegacyFoods = loadDataset(SOURCES.srLegacy);
  const allFoods = [...foundationFoods, ...srLegacyFoods];
  console.log(`  foundation_food: ${foundationFoods.length} foods`);
  console.log(`  sr_legacy_food:  ${srLegacyFoods.length} foods`);
  console.log(`  total:           ${allFoods.length} foods`);

  mkdirSync(OUT_DIR, { recursive: true });

  // Compact output: parallel arrays keyed by index, not an array of verbose
  // objects, to keep foods.json small.
  const ids = allFoods.map((f) => f.fdcId);
  const names = allFoods.map((f) => f.name);
  const sources = allFoods.map((f) => f.source);
  const nutrients: Record<string, (number | null)[]> = {};
  for (const cfg of NUTRIENT_CONFIG) {
    nutrients[cfg.key] = allFoods.map((f) => f.nutrients[cfg.key]);
  }

  const foodsJson = {
    version: 1,
    generatedAt: new Date().toISOString().slice(0, 10),
    count: allFoods.length,
    // 0 = USDA Foundation Foods, 1 = USDA SR Legacy
    sourceLabels: ["foundation_food", "sr_legacy_food"],
    nutrientUnits: Object.fromEntries(NUTRIENT_CONFIG.map((c) => [c.key, c.unit])),
    ids,
    names,
    sources,
    nutrients,
  };

  const foodsJsonPath = join(OUT_DIR, "foods.json");
  writeFileSync(foodsJsonPath, JSON.stringify(foodsJson));
  const rawBytes = statSync(foodsJsonPath).size;
  console.log(`\nWrote ${foodsJsonPath} (${(rawBytes / 1024 / 1024).toFixed(2)} MB raw)`);
  if (rawBytes > 5 * 1024 * 1024) {
    console.warn("  WARNING: foods.json exceeds the 5 MB target.");
  }

  // Prebuilt MiniSearch index over {id: array index, name}.
  const searchDocs = allFoods.map((f, i) => ({ id: i, name: f.name }));
  const miniSearch = new MiniSearch({
    idField: "id",
    fields: ["name"],
    storeFields: ["name"],
  });
  miniSearch.addAll(searchDocs);
  const indexPath = join(OUT_DIR, "foods-search-index.json");
  writeFileSync(indexPath, JSON.stringify(miniSearch));
  const indexBytes = statSync(indexPath).size;
  console.log(`Wrote ${indexPath} (${(indexBytes / 1024 / 1024).toFixed(2)} MB raw)`);

  // Self-test: acceptance criterion from the build spec.
  console.log('\nSelf-test: searching "chicken breast roasted"...');
  const results = miniSearch.search("chicken breast roasted", { prefix: true, fuzzy: 0.2 });
  const top = results[0];
  if (!top) {
    console.error("  FAILED: no results returned.");
    process.exitCode = 1;
    return;
  }
  const idx = top.id as number;
  console.log(`  top result: "${names[idx]}" (fdc_id ${ids[idx]}, score ${top.score.toFixed(2)})`);
  console.log(`  per-100g: ${nutrients.energyKcal[idx]} kcal, ${nutrients.proteinG[idx]}g protein, ${nutrients.fatG[idx]}g fat, ${nutrients.carbG[idx]}g carb`);
}

main();
