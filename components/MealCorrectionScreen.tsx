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
import Button from "@/components/ui/Button";
import Rule from "@/components/ui/Rule";

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
        <p className="text-sm text-toast">Estimated calories</p>
        <p className="font-display text-4xl">
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
            <div key={key}>
              <p className="text-xs text-toast">{MACRO_LABELS[key]}</p>
              <p className="text-base font-bold text-cocoa">
                {value == null ? "—" : `${Math.round(value)} g`}
                {summary?.lowConfidence && (
                  <span className="ml-1 text-toast" title="Low confidence">
                    ●
                  </span>
                )}
              </p>
            </div>
          );
        })}
      </div>

      <Rule color="toast" />

      <details>
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-bold">Micronutrients</summary>
        <ul className="mt-2 divide-y divide-toast/15 text-sm">
          {Object.entries(foodDb.data.nutrientUnits)
            .filter(([key]) => !MACRO_KEYS.includes(key) && key !== "energyKcal" && key !== "satFatG" && key !== "sugarG")
            .map(([key, unit]) => {
              const summary = nutrientSummary[key];
              const value = summary?.value;
              return (
                <li key={key} className="flex items-center justify-between py-1.5">
                  <span className="text-toast">{key}</span>
                  <span className="font-semibold text-cocoa">
                    {value == null ? "—" : `${roundToSignificantFigures(value, 2)} ${UNIT_LABELS[unit] ?? unit}`}
                    {summary?.lowConfidence && (
                      <span className="ml-1 font-normal text-toast" title="Low confidence">
                        ●
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
        </ul>
      </details>

      <div className="space-y-6">
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
          <Button type="button" variant="ghost" onClick={() => setAddingItem(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" onClick={() => setAddingItem(true)} className="w-full">
          + Add item
        </Button>
      )}

      <div className="flex items-center gap-4 pt-2">
        <Button type="button" variant="primary" onClick={onSave} disabled={items.length === 0 || saving}>
          {saving ? "Saving…" : "Save meal"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Discard
        </Button>
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
    <div>
      <Rule color="poppy" />
      <div className="flex items-start justify-between gap-2 pt-3">
        <div>
          <p className="text-base font-bold">{item.name}</p>
          {item.reasoning && <p className="text-xs text-toast">{item.reasoning}</p>}
          <p className="text-xs text-toast">Confidence: {Math.round(item.confidence * 100)}%</p>
        </div>
        <div className="flex shrink-0 gap-3">
          <Button type="button" variant="ghost" onClick={() => setChangingFood((v) => !v)} className="text-xs">
            Change food
          </Button>
          <Button type="button" variant="ghost" onClick={onRemove} className="text-xs">
            Remove
          </Button>
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
          className="h-11 flex-1 accent-poppy"
        />
        <input
          type="number"
          min={0}
          value={item.grams}
          onChange={(e) => onChange({ grams: Math.max(0, Number(e.target.value) || 0) })}
          className="min-h-11 w-20 rounded-lg border-2 border-toast/40 bg-white px-2 py-1 text-base text-cocoa"
        />
        <span className="text-sm text-toast">g</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {COMMON_PORTIONS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => onChange({ grams: preset.grams })}
            className="min-h-11 rounded-full border-2 border-avocado px-3 py-1 text-sm font-semibold text-cocoa"
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}
