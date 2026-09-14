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
        className="min-h-11 w-full rounded-lg border-2 border-toast/40 bg-white px-3 py-2 text-base text-cocoa"
      />
      {results.length > 0 && (
        <ul className="divide-y divide-toast/15 border-l-4 border-avocado">
          {results.map((food) => (
            <li key={food.index}>
              <button
                type="button"
                onClick={() => {
                  onSelect(food);
                  setQuery("");
                }}
                className="min-h-11 w-full px-3 py-2 text-left text-base text-cocoa hover:bg-marigold/15"
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
