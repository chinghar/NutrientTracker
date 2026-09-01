import type {
  AnalyzeResponse,
  BarcodeDetail,
  BodyWeightIn,
  BodyWeightOut,
  DashboardOut,
  FoodDetail,
  FoodSearchResult,
  MealIn,
  MealOut,
  ProfileIn,
  ProfileOut,
  SettingsOut,
  TargetsOut,
} from './types'

// Local dev leaves this unset -- requests go to relative /api/... paths,
// which Vite's dev-server proxy forwards to localhost:8000 (see
// vite.config.ts). A production deployment where the frontend and backend
// are separate Vercel projects sets this to the backend project's URL.
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text()
    let detail: string | undefined
    try {
      detail = (JSON.parse(body) as { detail?: string }).detail
    } catch {
      // body wasn't JSON -- fall through to the raw-body error below
    }
    throw new Error(detail ?? `${res.status} ${res.statusText}: ${body}`)
  }
  return res.json() as Promise<T>
}

export async function analyzeMeal(image: Blob, hint?: string): Promise<AnalyzeResponse> {
  const form = new FormData()
  form.append('image', image, 'meal.jpg')
  if (hint) form.append('hint', hint)
  const res = await fetch(`${API_BASE}/api/analyze`, { method: 'POST', body: form })
  return asJson(res)
}

export async function searchFoods(query: string, limit = 10): Promise<FoodSearchResult[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit) })
  const res = await fetch(`${API_BASE}/api/search?${params}`)
  return asJson(res)
}

export async function getFoodDetail(fdcId: number, grams: number): Promise<FoodDetail> {
  const params = new URLSearchParams({ grams: String(grams) })
  const res = await fetch(`${API_BASE}/api/foods/${fdcId}?${params}`)
  return asJson(res)
}

export async function getBarcodeDetail(code: string, grams = 100): Promise<BarcodeDetail> {
  const params = new URLSearchParams({ grams: String(grams) })
  const res = await fetch(`${API_BASE}/api/barcode/${encodeURIComponent(code)}?${params}`)
  return asJson(res)
}

export async function getSettings(): Promise<SettingsOut> {
  const res = await fetch(`${API_BASE}/api/settings`)
  return asJson(res)
}

export async function updateSettings(settings: SettingsOut): Promise<SettingsOut> {
  const res = await fetch(`${API_BASE}/api/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
  return asJson(res)
}

export async function saveMeal(meal: MealIn): Promise<MealOut> {
  const res = await fetch(`${API_BASE}/api/meals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(meal),
  })
  return asJson(res)
}

export async function listMeals(date?: string): Promise<MealOut[]> {
  const params = date ? `?${new URLSearchParams({ date })}` : ''
  const res = await fetch(`${API_BASE}/api/meals${params}`)
  return asJson(res)
}

export async function relogMeal(mealId: number): Promise<MealOut> {
  const res = await fetch(`${API_BASE}/api/meals/${mealId}/relog`, { method: 'POST' })
  return asJson(res)
}

export async function getProfile(): Promise<ProfileOut | null> {
  const res = await fetch(`${API_BASE}/api/profile`)
  return asJson(res)
}

export async function updateProfile(profile: ProfileIn): Promise<ProfileOut> {
  const res = await fetch(`${API_BASE}/api/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  })
  return asJson(res)
}

export async function getTargets(): Promise<TargetsOut> {
  const res = await fetch(`${API_BASE}/api/targets`)
  return asJson(res)
}

export async function getDashboard(date?: string): Promise<DashboardOut> {
  const params = date ? `?${new URLSearchParams({ date })}` : ''
  const res = await fetch(`${API_BASE}/api/dashboard${params}`)
  return asJson(res)
}

export async function logBodyWeight(entry: BodyWeightIn): Promise<BodyWeightOut> {
  const res = await fetch(`${API_BASE}/api/bodyweight`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  })
  return asJson(res)
}

export async function listBodyWeight(): Promise<BodyWeightOut[]> {
  const res = await fetch(`${API_BASE}/api/bodyweight`)
  return asJson(res)
}
