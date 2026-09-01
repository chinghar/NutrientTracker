import { useEffect, useState } from 'react'
import { getSettings, updateSettings } from '../api'

export function SettingsPanel() {
  const [diameter, setDiameter] = useState<string>('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    getSettings().then((s) => setDiameter(s.plate_diameter_cm != null ? String(s.plate_diameter_cm) : ''))
  }, [])

  async function save() {
    const value = diameter.trim() === '' ? null : Number(diameter)
    await updateSettings({ plate_diameter_cm: value })
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-700">
      <h2 className="font-medium">Plate calibration</h2>
      <p className="text-sm text-neutral-500">
        Set your usual plate's diameter so photo portion estimates have a size reference.
      </p>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={diameter}
          onChange={(e) => setDiameter(e.target.value)}
          placeholder="e.g. 27"
          className="w-24 rounded border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <span className="text-sm text-neutral-500">cm</span>
        <button
          onClick={save}
          className="rounded bg-neutral-800 px-3 py-1 text-sm text-white dark:bg-neutral-200 dark:text-neutral-900"
        >
          Save
        </button>
        {saved && <span className="text-sm text-green-600 dark:text-green-400">Saved</span>}
      </div>
    </div>
  )
}
