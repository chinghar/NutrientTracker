/** Round to a fixed number of significant figures -- never display a
 * micronutrient with false precision. */
export function toSigFigs(value: number, sigFigs: number): number {
  if (value === 0 || !Number.isFinite(value)) return 0
  const magnitude = Math.floor(Math.log10(Math.abs(value)))
  const factor = 10 ** (sigFigs - 1 - magnitude)
  return Math.round(value * factor) / factor
}

export function formatMicronutrient(value: number): string {
  return String(toSigFigs(value, 2))
}

export function nutrientUnit(key: string): string {
  if (key === 'energy_kcal') return 'kcal'
  if (key.endsWith('_mg')) return 'mg'
  if (key.endsWith('_ug')) return 'µg'
  if (key.endsWith('_g')) return 'g'
  return ''
}

const UPPERCASE_WORDS = new Set(['dfe', 'rae'])

export function nutrientLabel(key: string): string {
  const withoutUnit = key.replace(/_(mg|ug|g|kcal)$/, '')
  return withoutUnit
    .split('_')
    .map((word) => (UPPERCASE_WORDS.has(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ')
}

/** Mirrors backend/nutrition/scale.py's calorie_range so the correction
 * screen can recompute the range live after grams change, without a
 * round-trip just to refresh the displayed range. */
export function calorieRange(calories: number, confidence: number | null, maxDeviationPct = 0.3): [number, number] {
  if (confidence == null) return [calories, calories]
  const c = Math.max(0, Math.min(1, confidence))
  const deviation = calories * maxDeviationPct * (1 - c)
  return [Math.max(calories - deviation, 0), calories + deviation]
}

export function formatCalorieRange(low: number | null, high: number | null): string {
  if (low == null || high == null) return '—'
  const lowR = Math.round(low)
  const highR = Math.round(high)
  if (lowR === highR) return `${lowR} kcal`
  return `${lowR}–${highR} kcal`
}

export const LOW_CONFIDENCE_THRESHOLD = 0.5

export function isLowConfidence(confidence: number | null): boolean {
  return confidence != null && confidence < LOW_CONFIDENCE_THRESHOLD
}
