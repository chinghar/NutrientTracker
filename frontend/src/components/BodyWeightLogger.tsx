import { useEffect, useState } from 'react'
import { listBodyWeight, logBodyWeight } from '../api'
import type { BodyWeightOut } from '../types'

interface Props {
  onLogged: () => void
}

export function BodyWeightLogger({ onLogged }: Props) {
  const [weight, setWeight] = useState('')
  const [entries, setEntries] = useState<BodyWeightOut[]>([])
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    listBodyWeight().then(setEntries)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const value = Number(weight)
    if (!value) return
    await logBodyWeight({ weight_kg: value })
    setWeight('')
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
    setEntries(await listBodyWeight())
    onLogged()
  }

  const recent = [...entries].reverse().slice(0, 5)

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-700">
      <h2 className="font-medium">Bodyweight</h2>
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          type="number"
          step="0.1"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder="kg"
          className="w-24 rounded border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          type="submit"
          className="rounded bg-neutral-800 px-3 py-1 text-sm text-white dark:bg-neutral-200 dark:text-neutral-900"
        >
          Log today
        </button>
        {saved && <span className="text-sm text-green-600 dark:text-green-400">Saved</span>}
      </form>
      {recent.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm text-neutral-500">
          {recent.map((e) => (
            <li key={e.id}>
              {e.log_date}: {e.weight_kg} kg
            </li>
          ))}
        </ul>
      )}
      {entries.length < 14 && (
        <p className="text-xs text-neutral-400">
          Log your weight daily — after 14+ days, targets adjust automatically based on your actual trend.
        </p>
      )}
    </div>
  )
}
