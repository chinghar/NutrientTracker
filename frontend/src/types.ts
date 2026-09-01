export interface AnalyzedItem {
  name: string
  usda_query: string
  estimated_grams: number
  confidence: number
  reasoning: string
  fdc_id: number | null
  matched_description: string | null
  nutrients: Record<string, number>
  calories: number | null
  calories_low: number | null
  calories_high: number | null
}

export interface AnalyzeResponse {
  items: AnalyzedItem[]
  manual_entry_required: boolean
  message: string | null
}

export interface FoodSearchResult {
  fdc_id: number
  description: string
  data_type: string
  food_category: string | null
}

export interface FoodDetail {
  fdc_id: number
  description: string
  grams: number
  nutrients: Record<string, number>
}

export interface BarcodeDetail {
  barcode: string
  product_name: string | null
  brands: string | null
  grams: number
  nutrients: Record<string, number>
}

export interface SettingsOut {
  plate_diameter_cm: number | null
}

export interface MealItemIn {
  name: string
  fdc_id?: number | null
  off_barcode?: string | null
  grams: number
  confidence?: number | null
}

export interface MealIn {
  source: 'photo' | 'barcode' | 'manual'
  items: MealItemIn[]
}

export interface MealItemOut {
  id: number
  name: string
  fdc_id: number | null
  off_barcode: string | null
  grams: number
  confidence: number | null
  nutrients: Record<string, number>
}

export interface MealOut {
  id: number
  logged_at: string
  source: string
  relogged_from_id: number | null
  items: MealItemOut[]
}

/** An item on the correction screen: either a vision-estimated item pending
 * confirmation, or a manually/barcode-added one. Always editable. */
export interface DraftItem {
  key: string
  name: string
  fdc_id: number | null
  off_barcode: string | null
  grams: number
  confidence: number | null
  nutrients: Record<string, number>
  calories_low: number | null
  calories_high: number | null
}

export type Sex = 'male' | 'female'
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'heavy' | 'athlete'
export type Goal = 'fat_loss' | 'muscle_gain' | 'maintenance'

export interface ProfileIn {
  weight_kg: number
  height_cm: number
  age_years: number
  sex: Sex
  activity_level: ActivityLevel
  goal: Goal
  body_fat_pct?: number | null
  goal_weight_kg?: number | null
  rate_pct?: number | null
}

export interface ProfileOut extends ProfileIn {
  updated_at: string
}

export interface MacrosOut {
  protein_g: number
  fat_g: number
  carb_g: number
  fiber_g: number
}

export interface CalibrationOut {
  logging_bias_factor: number
  bias_pct: number
  days: number
  message: string
}

export interface TargetsOut {
  bmr: number
  tdee: number
  calories: number
  clamped: boolean
  clamp_explanation: string | null
  show_eating_disorder_resource: boolean
  macros: MacrosOut
  calibration: CalibrationOut | null
}

export interface BodyWeightIn {
  weight_kg: number
  log_date?: string | null
}

export interface BodyWeightOut {
  id: number
  log_date: string
  weight_kg: number
}

export interface MicronutrientProgressOut {
  key: string
  amount: number
  unit: string
  rda: number
  pct_rda: number
  ul: number | null
  near_ul: boolean
}

export interface DailyTotalsOut {
  calories: number
  protein_g: number
  fat_g: number
  carbohydrate_g: number
  fiber_g: number
}

export interface DashboardOut {
  date: string
  daily: DailyTotalsOut
  weekly_avg: DailyTotalsOut
  targets: TargetsOut | null
  micronutrients: MicronutrientProgressOut[]
}
