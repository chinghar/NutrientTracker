import { useState } from 'react'
import { searchFoods } from '../api'
import type { FoodSearchResult } from '../types'

interface Props {
  onSelect: (result: FoodSearchResult) => void
}

export function ManualSearch({ onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FoodSearchResult[]>([])
  const [loading, setLoading] = useState(false)

  async function runSearch(q: string) {
    setQuery(q)
    if (q.trim().length < 2) {
      setResults([])
      return
    }
    setLoading(true)
    try {
      setResults(await searchFoods(q))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        value={query}
        onChange={(e) => runSearch(e.target.value)}
        placeholder="Search foods (e.g. chicken breast roasted)"
        className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
      />
      {loading && <p className="text-sm text-neutral-500">Searching…</p>}
      <ul className="flex flex-col gap-1">
        {results.map((r) => (
          <li key={r.fdc_id}>
            <button
              onClick={() => onSelect(r)}
              className="w-full rounded px-3 py-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <span className="font-medium">{r.description}</span>
              {r.food_category && <span className="ml-2 text-sm text-neutral-500">{r.food_category}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
