import { useEffect, useState } from 'react'
import { getProfile, updateProfile } from '../api'
import type { ActivityLevel, Goal, ProfileIn, Sex } from '../types'

const DEFAULT_PROFILE: ProfileIn = {
  weight_kg: 70,
  height_cm: 170,
  age_years: 25,
  sex: 'female',
  activity_level: 'moderate',
  goal: 'maintenance',
}

interface Props {
  onSaved: () => void
}

export function ProfileForm({ onSaved }: Props) {
  const [profile, setProfile] = useState<ProfileIn>(DEFAULT_PROFILE)
  const [hasExisting, setHasExisting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getProfile().then((p) => {
      if (p) {
        setProfile(p)
        setHasExisting(true)
      }
    })
  }, [])

  function set<K extends keyof ProfileIn>(key: K, value: ProfileIn[K]) {
    setProfile((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await updateProfile(profile)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-700">
      <h2 className="font-medium">{hasExisting ? 'Update your profile' : 'Set up your profile'}</h2>
      <p className="text-sm text-neutral-500">Used to calculate your calorie and macro targets. Must be 18 or older.</p>

      <div className="grid grid-cols-2 gap-3">
        <label htmlFor="profile-weight" className="flex flex-col gap-1 text-sm">
          Weight (kg)
          <input
            id="profile-weight"
            type="number"
            value={profile.weight_kg}
            onChange={(e) => set('weight_kg', Number(e.target.value))}
            className="rounded border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
            required
          />
        </label>
        <label htmlFor="profile-height" className="flex flex-col gap-1 text-sm">
          Height (cm)
          <input
            id="profile-height"
            type="number"
            value={profile.height_cm}
            onChange={(e) => set('height_cm', Number(e.target.value))}
            className="rounded border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
            required
          />
        </label>
        <label htmlFor="profile-age" className="flex flex-col gap-1 text-sm">
          Age
          <input
            id="profile-age"
            type="number"
            value={profile.age_years}
            onChange={(e) => set('age_years', Number(e.target.value))}
            className="rounded border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
            required
          />
        </label>
        <label htmlFor="profile-sex" className="flex flex-col gap-1 text-sm">
          Sex
          <select
            id="profile-sex"
            value={profile.sex}
            onChange={(e) => set('sex', e.target.value as Sex)}
            className="rounded border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value="female">Female</option>
            <option value="male">Male</option>
          </select>
        </label>
        <label htmlFor="profile-activity" className="flex flex-col gap-1 text-sm">
          Activity level
          <select
            id="profile-activity"
            value={profile.activity_level}
            onChange={(e) => set('activity_level', e.target.value as ActivityLevel)}
            className="rounded border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value="sedentary">Sedentary</option>
            <option value="light">Light</option>
            <option value="moderate">Moderate</option>
            <option value="heavy">Heavy</option>
            <option value="athlete">Athlete</option>
          </select>
        </label>
        <label htmlFor="profile-goal" className="flex flex-col gap-1 text-sm">
          Goal
          <select
            id="profile-goal"
            value={profile.goal}
            onChange={(e) => set('goal', e.target.value as Goal)}
            className="rounded border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value="maintenance">Maintain</option>
            <option value="fat_loss">Fat loss</option>
            <option value="muscle_gain">Muscle gain</option>
          </select>
        </label>
        <label htmlFor="profile-body-fat" className="flex flex-col gap-1 text-sm">
          Body fat % (optional)
          <input
            id="profile-body-fat"
            type="number"
            value={profile.body_fat_pct ?? ''}
            onChange={(e) => set('body_fat_pct', e.target.value === '' ? null : Number(e.target.value))}
            placeholder="More accurate BMR"
            className="rounded border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        {profile.goal === 'fat_loss' && (
          <label htmlFor="profile-goal-weight" className="flex flex-col gap-1 text-sm">
            Goal weight (kg, optional)
            <input
              id="profile-goal-weight"
              type="number"
              value={profile.goal_weight_kg ?? ''}
              onChange={(e) => set('goal_weight_kg', e.target.value === '' ? null : Number(e.target.value))}
              className="rounded border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
            />
          </label>
        )}
      </div>

      {error && <p className="text-sm text-neutral-600 dark:text-neutral-400">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="self-start rounded-full bg-blue-600 px-5 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save profile'}
      </button>
    </form>
  )
}
