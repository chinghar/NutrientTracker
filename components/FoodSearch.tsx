"use client";

import { useState } from "react";
import { searchFoods, type FoodDb } from "@/lib/food-db/repository";
import type { FoodRecord } from "@/lib/food-db/types";

interface FoodSearchProps {
  foodDb: FoodDb;
  onSelect: (food: FoodRecord) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

/** Manual text search against the local, prebuilt MiniSearch food index. */
export default function FoodSearch({ foodDb, onSelect, placeholder, autoFocus }: FoodSearchProps) {
  const [query, setQuery] = useState("");
  const results = query.trim() ? searchFoods(foodDb, query, 8) : [];

  return (
    <div className="space-y-2">
      <input
        autoFocus={autoFocus}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder ?? "Search foods…"}
        className="w-full rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
      />
      {results.length > 0 && (
        <ul className="divide-y divide-neutral-200 rounded border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {results.map((food) => (
            <li key={food.index}>
              <button
                type="button"
                onClick={() => {
                  onSelect(food);
                  setQuery("");
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                {food.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
