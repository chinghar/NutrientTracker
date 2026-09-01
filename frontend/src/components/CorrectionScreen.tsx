import { useEffect, useRef, useState } from 'react'
import { getBarcodeDetail, getFoodDetail } from '../api'
import { MACRO_KEYS, PORTION_PRESETS } from '../constants'
import type { DraftItem } from '../types'
import { calorieRange, formatCalorieRange, formatMicronutrient, isLowConfidence, nutrientLabel, nutrientUnit } from '../utils/format'
import { ManualSearch } from './ManualSearch'

interface Props {
  items: DraftItem[]
  onChange: (items: DraftItem[]) => void
}

export function CorrectionScreen({ items, onChange }: Props) {
  const [reassigningKey, setReassigningKey] = useState<string | null>(null)

  function updateItem(key: string, patch: Partial<DraftItem>) {
    onChange(items.map((it) => (it.key === key ? { ...it, ...patch } : it)))
  }

  function removeItem(key: string) {
    onChange(items.filter((it) => it.key !== key))
  }

  async function refetchNutrients(item: DraftItem, grams: number) {
    try {
      if (item.fdc_id != null) {
        const detail = await getFoodDetail(item.fdc_id, grams)
        updateItem(item.key, { grams, nutrients: detail.nutrients })
      } else if (item.off_barcode != null) {
        const detail = await getBarcodeDetail(item.off_barcode, grams)
        updateItem(item.key, { grams, nutrients: detail.nutrients })
      } else {
        updateItem(item.key, { grams })
      }
    } catch {
      updateItem(item.key, { grams })
    }
  }

  let totalLow = 0
  let totalHigh = 0
  for (const item of items) {
    const [low, high] = calorieRange(item.nutrients.energy_kcal ?? 0, item.confidence)
    totalLow += low
    totalHigh += high
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg bg-neutral-100 p-4 text-center dark:bg-neutral-800">
        <p className="text-sm text-neutral-500">Estimated total</p>
        <p className="text-2xl font-semibold">{formatCalorieRange(totalLow, totalHigh)}</p>
      </div>

      <ul className="flex flex-col gap-4">
        {items.map((item) => (
          <li key={item.key} className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-700">
            <FoodItemEditor
              item={item}
              onGramsChange={(grams) => refetchNutrients(item, grams)}
              onReassign={() => setReassigningKey(item.key)}
              onRemove={() => removeItem(item.key)}
            />
          </li>
        ))}
      </ul>

      {items.length === 0 && <p className="text-center text-neutral-500">No items yet. Add one from search below.</p>}

      {reassigningKey && (
        <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-700">
          <p className="mb-2 font-medium">Search for the right food</p>
          <ManualSearch
            onSelect={async (result) => {
              const item = items.find((it) => it.key === reassigningKey)
              if (!item) return
              const detail = await getFoodDetail(result.fdc_id, item.grams)
              updateItem(reassigningKey, {
                name: result.description,
                fdc_id: result.fdc_id,
                off_barcode: null,
                nutrients: detail.nutrients,
                confidence: 1,
                calories_low: null,
                calories_high: null,
              })
              setReassigningKey(null)
            }}
          />
          <button onClick={() => setReassigningKey(null)} className="mt-2 text-sm text-neutral-500 underline">
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

function FoodItemEditor({
  item,
  onGramsChange,
  onReassign,
  onRemove,
}: {
  item: DraftItem
  onGramsChange: (grams: number) => void
  onReassign: () => void
  onRemove: () => void
}) {
  const [grams, setGrams] = useState(item.grams)
  const debounceRef = useRef<number | undefined>(undefined)

  useEffect(() => setGrams(item.grams), [item.grams])

  function handleGramsInput(value: number) {
    if (!Number.isFinite(value) || value < 0) return
    setGrams(value)
    window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => onGramsChange(value), 200)
  }

  const micronutrientEntries = Object.entries(item.nutrients).filter(([key]) => !MACRO_KEYS.includes(key))
  const [calLow, calHigh] = calorieRange(item.nutrients.energy_kcal ?? 0, item.confidence)
  const lowConfidence = isLowConfidence(item.confidence)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">{item.name}</p>
          {item.confidence != null && (
            <p className="text-xs text-neutral-500">
              {Math.round(item.confidence * 100)}% confidence
              {lowConfidence && <span className="ml-1 text-amber-600 dark:text-amber-400">· low confidence</span>}
            </p>
          )}
        </div>
        <div className="flex gap-3">
          <button onClick={onReassign} className="text-sm text-blue-600 underline dark:text-blue-400">
            Not right?
          </button>
          <button onClick={onRemove} className="text-sm text-neutral-500 underline">
            Remove
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {PORTION_PRESETS.map((preset) => (
          <button
            key={preset.label}
            onClick={() => handleGramsInput(preset.grams)}
            className="rounded-full border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <input
          type="range"
          min={5}
          max={800}
          step={5}
          value={grams}
          onChange={(e) => handleGramsInput(Number(e.target.value))}
          className="flex-1"
        />
        <input
          type="number"
          value={Math.round(grams)}
          onChange={(e) => handleGramsInput(Number(e.target.value))}
          className="w-20 rounded border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <span className="text-sm text-neutral-500">g</span>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <span className="font-medium">{formatCalorieRange(calLow, calHigh)}</span>
        <span>{formatMicronutrient(item.nutrients.protein_g ?? 0)}g protein</span>
        <span>{formatMicronutrient(item.nutrients.fat_g ?? 0)}g fat</span>
        <span>{formatMicronutrient(item.nutrients.carbohydrate_g ?? 0)}g carb</span>
      </div>

      {micronutrientEntries.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-neutral-500">Micronutrients</summary>
          <ul className="mt-2 grid grid-cols-2 gap-1 text-sm sm:grid-cols-3">
            {micronutrientEntries.map(([key, value]) => (
              <li key={key} className="flex justify-between gap-2">
                <span>{nutrientLabel(key)}</span>
                <span className={lowConfidence ? 'text-amber-600 dark:text-amber-400' : ''}>
                  {formatMicronutrient(value)} {nutrientUnit(key)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
