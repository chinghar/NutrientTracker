import { useEffect, useState } from 'react'
import { listMeals, relogMeal } from '../api'
import type { MealOut } from '../types'

interface Props {
  refreshKey: number
  onRelogged: () => void
}

export function MealHistory({ refreshKey, onRelogged }: Props) {
  const [meals, setMeals] = useState<MealOut[]>([])

  useEffect(() => {
    listMeals().then(setMeals)
  }, [refreshKey])

  async function handleRelog(mealId: number) {
    await relogMeal(mealId)
    onRelogged()
  }

  if (meals.length === 0) {
    return <p className="text-sm text-neutral-500">No meals logged yet.</p>
  }

  return (
    <ul className="flex flex-col gap-2">
      {[...meals].reverse().map((meal) => {
        const totalKcal = meal.items.reduce((sum, i) => sum + (i.nutrients.energy_kcal ?? 0), 0)
        const names = meal.items.map((i) => i.name).join(', ') || '(empty)'
        return (
          <li
            key={meal.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-700"
          >
            <div>
              <p className="font-medium">{names}</p>
              <p className="text-sm text-neutral-500">
                {Math.round(totalKcal)} kcal · {new Date(meal.logged_at).toLocaleString()}
              </p>
            </div>
            <button
              onClick={() => handleRelog(meal.id)}
              className="whitespace-nowrap rounded-full border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              Ate this again
            </button>
          </li>
        )
      })}
    </ul>
  )
}
