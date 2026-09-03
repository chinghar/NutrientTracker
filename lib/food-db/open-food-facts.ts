import { z } from "zod";

/** Loosely typed on purpose — OFF products carry hundreds of fields; we only read a handful. */
const productResponseSchema = z.object({
  status: z.number(),
  product: z
    .object({
      product_name: z.string().optional(),
      brands: z.string().optional(),
      nutriments: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
});

export interface OpenFoodFactsProduct {
  barcode: string;
  name: string;
  brand?: string;
  /** per-100g values, keyed to match our internal nutrient keys where OFF provides them. Only keys with real data are present. */
  nutrients: Record<string, number>;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/**
 * Looks up a product by barcode directly against the Open Food Facts public
 * API (no key, CORS-open — verified in Phase 1). Only maps the macros and
 * sodium; OFF rarely carries the full micronutrient panel for packaged foods.
 */
export async function lookupBarcode(barcode: string): Promise<OpenFoodFactsProduct | null> {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`);
  if (!res.ok) return null;

  const parsed = productResponseSchema.safeParse(await res.json());
  if (!parsed.success || parsed.data.status !== 1 || !parsed.data.product) return null;

  const n = parsed.data.product.nutriments ?? {};
  const sodiumG = toNumber(n["sodium_100g"]) ?? (toNumber(n["salt_100g"]) != null ? toNumber(n["salt_100g"])! / 2.5 : undefined);

  const nutrients: Record<string, number> = {};
  const set = (key: string, value: number | undefined) => {
    if (value != null) nutrients[key] = value;
  };
  set("energyKcal", toNumber(n["energy-kcal_100g"]));
  set("proteinG", toNumber(n["proteins_100g"]));
  set("fatG", toNumber(n["fat_100g"]));
  set("satFatG", toNumber(n["saturated-fat_100g"]));
  set("carbG", toNumber(n["carbohydrates_100g"]));
  set("fiberG", toNumber(n["fiber_100g"]));
  set("sugarG", toNumber(n["sugars_100g"]));
  if (sodiumG != null) set("sodiumMg", sodiumG * 1000);

  return {
    barcode,
    name: parsed.data.product.product_name?.trim() || "Unknown product",
    brand: parsed.data.product.brands?.split(",")[0]?.trim(),
    nutrients,
  };
}
