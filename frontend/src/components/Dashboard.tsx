import { useEffect, useState } from 'react'
import { getDashboard } from '../api'
import type { DashboardOut } from '../types'
import { formatMicronutrient, nutrientLabel } from '../utils/format'
import { EatingDisorderResourceCard } from './EatingDisorderResourceCard'

interface Props {
  refreshKey: number
}

export function Dashboard({ refreshKey }: Props) {
  const [data, setData] = useState<DashboardOut | null>(null)

  useEffect(() => {
    getDashboard().then(setData)
  }, [refreshKey])

  if (!data) return <p className="text-sm text-neutral-500">Loading…</p>

  const targets = data.targets

  return (
    <div className="flex flex-col gap-6">
      {targets?.show_eating_disorder_resource && <EatingDisorderResourceCard />}

      {/* Weekly average is the visual hero -- single-day estimates are
          unreliable, weekly averages are not. */}
      <div className="rounded-xl bg-blue-600 p-6 text-center text-white">
        <p className="text-sm uppercase tracking-wide text-blue-100">7-day average</p>
        <p className="text-4xl font-bold">{Math.round(data.weekly_avg.calories)} kcal/day</p>
        <p className="mt-1 text-sm text-blue-100">
          {formatMicronutrient(data.weekly_avg.protein_g)}g protein · {formatMicronutrient(data.weekly_avg.fat_g)}g fat
          · {formatMicronutrient(data.weekly_avg.carbohydrate_g)}g carb
        </p>
      </div>

      <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-700">
        <p className="mb-3 text-sm text-neutral-500">Today</p>
        <div className="flex flex-col gap-3">
          <NutrientBar label="Calories" amount={data.daily.calories} target={targets?.calories ?? null} unit=" kcal" />
          <NutrientBar label="Protein" amount={data.daily.protein_g} target={targets?.macros.protein_g ?? null} unit="g" />
          <NutrientBar label="Fat" amount={data.daily.fat_g} target={targets?.macros.fat_g ?? null} unit="g" />
          <NutrientBar label="Carbs" amount={data.daily.carbohydrate_g} target={targets?.macros.carb_g ?? null} unit="g" />
          <NutrientBar label="Fiber" amount={data.daily.fiber_g} target={targets?.macros.fiber_g ?? null} unit="g" />
        </div>
      </div>

      {!targets && <p className="text-sm text-neutral-500">Set up your profile below to see targets and progress.</p>}

      {targets?.calibration && (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm dark:border-neutral-700 dark:bg-neutral-800">
          {targets.calibration.message}
        </div>
      )}

      {targets?.clamped && targets.clamp_explanation && (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm dark:border-neutral-700 dark:bg-neutral-800">
          {targets.clamp_explanation}
        </div>
      )}

      <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-700">
        <p className="mb-3 font-medium">Micronutrients today</p>
        <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-1">
          {data.micronutrients.map((m) => (
            <li key={m.key} className="flex items-center justify-between gap-3 text-sm">
              <span>{nutrientLabel(m.key)}</span>
              <span className="flex items-center gap-2">
                <span className="text-neutral-500">
                  {formatMicronutrient(m.amount)} / {formatMicronutrient(m.rda)} {m.unit} ({Math.round(m.pct_rda)}%)
                </span>
                {m.near_ul && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                    near upper limit
                  </span>
                )}
              </span>
            </li>
          ))}
          {data.micronutrients.length === 0 && (
            <li className="text-sm text-neutral-500">Set up your profile to see micronutrient progress.</li>
          )}
        </ul>
      </div>
    </div>
  )
}

/** Amounts always render in plain neutral text, whether under or over
 * target -- no red "over budget" styling, no shaming. */
function NutrientBar({
  label,
  amount,
  target,
  unit,
}: {
  label: string
  amount: number
  target: number | null
  unit: string
}) {
  const pct = target ? Math.min(100, (amount / target) * 100) : 0
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-neutral-500">
          {Math.round(amount)}
          {unit}
          {target != null && ` / ${Math.round(target)}${unit}`}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
        <div className="h-2 rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
