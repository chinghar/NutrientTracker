import type { MealItemSource } from "@/lib/db/db";

/** A meal item while it's still being edited on the correction screen (not yet saved). */
export interface MealItemDraft {
  /** Stable local id for list rendering/editing — not persisted. */
  localId: string;
  name: string;
  grams: number;
  confidence: number;
  nutrientsPer100g: Record<string, number | null>;
  source: MealItemSource;
  reasoning?: string;
}

export function makeLocalId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
