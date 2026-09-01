export const PORTION_PRESETS: { label: string; grams: number }[] = [
  { label: '1 tbsp', grams: 15 },
  { label: '1 oz', grams: 28 },
  { label: '1 palm', grams: 85 },
  { label: '1 medium', grams: 150 },
  { label: '1 cup', grams: 240 },
]

/** Macro + calorie keys shown prominently; everything else in `nutrients`
 * is treated as a micronutrient in the scrollable list. */
export const MACRO_KEYS = ['energy_kcal', 'protein_g', 'fat_g', 'carbohydrate_g', 'fiber_g']
