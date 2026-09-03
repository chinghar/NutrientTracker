"use client";

import { useState } from "react";
import {
  computeMealCalorieRange,
  computeMealNutrientSummary,
  roundToSignificantFigures,
} from "@/lib/nutrition/compute";
import { COMMON_PORTIONS } from "@/lib/portions";
import type { MealItemDraft } from "@/lib/meal";
import type { FoodDb } from "@/lib/food-db/repository";
import type { FoodRecord } from "@/lib/food-db/types";
import FoodSearch from "./FoodSearch";

const UNIT_LABELS: Record<string, string> = { KCAL: "kcal", G: "g", MG: "mg", UG: "µg" };

/** Macro keys shown as headline numbers; everything else in nutrientUnits is treated as a micronutrient. */
const MACRO_KEYS = ["proteinG", "fatG", "carbG", "fiberG"];
const MACRO_LABELS: Record<string, string> = { proteinG: "Protein", fatG: "Fat", carbG: "Carbs", fiberG: "Fiber" };

interface MealCorrectionScreenProps {
  items: MealItemDraft[];
  foodDb: FoodDb;
  onItemsChange: (items: MealItemDraft[]) => void;
  onSave: () => void;
  onCancel: () => void;
  saving?: boolean;
}

export default function MealCorrectionScreen({
  items,
  foodDb,
  onItemsChange,
  onSave,
  onCancel,
  saving,
}: MealCorrectionScreenProps) {
  const [addingItem, setAddingItem] = useState(false);

  function updateItem(localId: string, patch: Partial<MealItemDraft>) {
    onItemsChange(items.map((item) => (item.localId === localId ? { ...item, ...patch } : item)));
  }

  function removeItem(localId: string) {
    onItemsChange(items.filter((item) => item.localId !== localId));
  }

  function addItem(food: FoodRecord) {
    onItemsChange([
      ...items,
      {
        localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: food.name,
        grams: 100,
        confidence: 1,
        nutrientsPer100g: food.nutrients,
        source: "manual",
      },
    ]);
    setAddingItem(false);
  }

  const calorieRange = computeMealCalorieRange(items);
  const nutrientSummary = computeMealNutrientSummary(items);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-neutral-500">Estimated calories</p>
        <p className="text-2xl font-semibold">
          {calorieRange.low === calorieRange.high
            ? `${calorieRange.point} kcal`
            : `${calorieRange.low}–${calorieRange.high} kcal`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {MACRO_KEYS.map((key) => {
          const summary = nutrientSummary[key];
          const value = summary?.value;
          return (
            <div key={key} className="rounded border border-neutral-200 p-2 dark:border-neutral-800">
              <p className="text-xs text-neutral-500">{MACRO_LABELS[key]}</p>
              <p className="text-sm font-medium">
                {value == null ? "—" : `${Math.round(value)} g`}
                {summary?.lowConfidence && <span className="ml-1 text-amber-500" title="Low confidence">●</span>}
              </p>
            </div>
          );
        })}
      </div>

      <details className="rounded border border-neutral-200 p-3 text-sm dark:border-neutral-800">
        <summary className="cursor-pointer font-medium">Micronutrients</summary>
        <ul className="mt-2 space-y-1">
          {Object.entries(foodDb.data.nutrientUnits)
            .filter(([key]) => !MACRO_KEYS.includes(key) && key !== "energyKcal" && key !== "satFatG" && key !== "sugarG")
            .map(([key, unit]) => {
              const summary = nutrientSummary[key];
              const value = summary?.value;
              return (
                <li key={key} className="flex items-center justify-between">
                  <span className="text-neutral-500">{key}</span>
                  <span>
                    {value == null ? "—" : `${roundToSignificantFigures(value, 2)} ${UNIT_LABELS[unit] ?? unit}`}
                    {summary?.lowConfidence && <span className="ml-1 text-amber-500" title="Low confidence">●</span>}
                  </span>
                </li>
              );
            })}
        </ul>
      </details>

      <div className="space-y-4">
        {items.map((item) => (
          <MealItemEditor
            key={item.localId}
            item={item}
            foodDb={foodDb}
            onChange={(patch) => updateItem(item.localId, patch)}
            onRemove={() => removeItem(item.localId)}
          />
        ))}
      </div>

      {addingItem ? (
        <div className="space-y-2">
          <FoodSearch foodDb={foodDb} onSelect={addItem} placeholder="Add another food…" autoFocus />
          <button type="button" onClick={() => setAddingItem(false)} className="text-sm text-neutral-500 underline">
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddingItem(true)}
          className="w-full rounded border border-dashed border-neutral-300 py-2 text-sm text-neutral-500 dark:border-neutral-700"
        >
          + Add item
        </button>
      )}

      <div className="flex items-center gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
        <button
          type="button"
          onClick={onSave}
          disabled={items.length === 0 || saving}
          className="rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {saving ? "Saving…" : "Save meal"}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-neutral-500 underline">
          Discard
        </button>
      </div>
    </div>
  );
}

interface MealItemEditorProps {
  item: MealItemDraft;
  foodDb: FoodDb;
  onChange: (patch: Partial<MealItemDraft>) => void;
  onRemove: () => void;
}

function MealItemEditor({ item, foodDb, onChange, onRemove }: MealItemEditorProps) {
  const [changingFood, setChangingFood] = useState(false);

  return (
    <div className="rounded border border-neutral-200 p-3 dark:border-neutral-800">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{item.name}</p>
          {item.reasoning && <p className="text-xs text-neutral-500">{item.reasoning}</p>}
          <p className="text-xs text-neutral-400">Confidence: {Math.round(item.confidence * 100)}%</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => setChangingFood((v) => !v)} className="text-xs text-neutral-500 underline">
            Change food
          </button>
          <button type="button" onClick={onRemove} className="text-xs text-neutral-500 underline">
            Remove
          </button>
        </div>
      </div>

      {changingFood && (
        <div className="mt-2">
          <FoodSearch
            foodDb={foodDb}
            autoFocus
            onSelect={(food) => {
              onChange({ name: food.name, nutrientsPer100g: food.nutrients, source: "manual", confidence: 1 });
              setChangingFood(false);
            }}
          />
        </div>
      )}

      <div className="mt-3 flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={500}
          step={5}
          value={item.grams}
          onChange={(e) => onChange({ grams: Number(e.target.value) })}
          className="flex-1"
        />
        <input
          type="number"
          min={0}
          value={item.grams}
          onChange={(e) => onChange({ grams: Math.max(0, Number(e.target.value) || 0) })}
          className="w-20 rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <span className="text-sm text-neutral-500">g</span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {COMMON_PORTIONS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => onChange({ grams: preset.grams })}
            className="rounded-full border border-neutral-300 px-2.5 py-1 text-xs dark:border-neutral-700"
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}
