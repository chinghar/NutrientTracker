export interface PortionPreset {
  label: string;
  grams: number;
}

/** Generic, food-agnostic gram estimates for common portion-size language, used as one-tap presets on the correction screen. */
export const COMMON_PORTIONS: PortionPreset[] = [
  { label: "1 tbsp", grams: 15 },
  { label: "1/4 cup", grams: 60 },
  { label: "1/2 cup", grams: 120 },
  { label: "1 cup", grams: 240 },
  { label: "1 handful", grams: 30 },
  { label: "1 palm", grams: 85 },
  { label: "1 small", grams: 100 },
  { label: "1 medium", grams: 150 },
  { label: "1 large", grams: 220 },
];
