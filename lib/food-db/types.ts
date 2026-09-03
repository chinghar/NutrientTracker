/** Shape of public/data/foods.json, produced by scripts/build-food-db.ts. */
export interface FoodDbData {
  version: number;
  generatedAt: string;
  count: number;
  sourceLabels: string[];
  nutrientUnits: Record<string, string>;
  ids: number[];
  names: string[];
  sources: number[];
  nutrients: Record<string, (number | null)[]>;
}

export interface FoodRecord {
  index: number;
  fdcId: number;
  name: string;
  source: number;
  /** per-100g values keyed by nutrient key (energyKcal, proteinG, ...). */
  nutrients: Record<string, number | null>;
}
