import { useState } from 'react'
import { analyzeMeal, getBarcodeDetail, getFoodDetail, saveMeal } from './api'
import { BarcodeScanner } from './components/BarcodeScanner'
import { BodyWeightLogger } from './components/BodyWeightLogger'
import { CameraCapture } from './components/CameraCapture'
import { CorrectionScreen } from './components/CorrectionScreen'
import { Dashboard } from './components/Dashboard'
import { ManualSearch } from './components/ManualSearch'
import { MealHistory } from './components/MealHistory'
import { ProfileForm } from './components/ProfileForm'
import { SettingsPanel } from './components/SettingsPanel'
import type { DraftItem, FoodSearchResult, MealIn } from './types'

type Stage = 'home' | 'photo' | 'barcode' | 'analyzing' | 'correcting' | 'manual-add'
type View = 'log' | 'dashboard'

function newKey(): string {
  return crypto.randomUUID()
}

export default function App() {
  const [view, setView] = useState<View>('log')
  const [stage, setStage] = useState<Stage>('home')
  const [items, setItems] = useState<DraftItem[]>([])
  const [source, setSource] = useState<MealIn['source']>('manual')
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [historyKey, setHistoryKey] = useState(0)
  const [dashboardKey, setDashboardKey] = useState(0)
  const [addingItem, setAddingItem] = useState<'search' | 'barcode' | null>(null)
  const [showProfileForm, setShowProfileForm] = useState(false)

  function resetToHome() {
    setStage('home')
    setItems([])
    setStatusMessage(null)
    setAddingItem(null)
  }

  async function handlePhotoCaptured(blob: Blob) {
    setStage('analyzing')
    setSource('photo')
    try {
      const result = await analyzeMeal(blob)
      if (result.manual_entry_required || result.items.length === 0) {
        setStatusMessage(result.message ?? 'Could not identify the meal automatically. Search for the foods below.')
        setItems([])
        setStage('manual-add')
        return
      }
      setItems(
        result.items.map((it) => ({
          key: newKey(),
          name: it.matched_description ?? it.name,
          fdc_id: it.fdc_id,
          off_barcode: null,
          grams: it.estimated_grams,
          confidence: it.confidence,
          nutrients: it.nutrients,
          calories_low: it.calories_low,
          calories_high: it.calories_high,
        })),
      )
      setStatusMessage(null)
      setStage('correcting')
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : String(err))
      setStage('manual-add')
    }
  }

  async function handleBarcodeDetected(code: string) {
    setSource('barcode')
    try {
      const detail = await getBarcodeDetail(code)
      setItems((prev) => [
        ...prev,
        {
          key: newKey(),
          name: detail.product_name ?? `Barcode ${code}`,
          fdc_id: null,
          off_barcode: detail.barcode,
          grams: detail.grams,
          confidence: 1,
          nutrients: detail.nutrients,
          calories_low: null,
          calories_high: null,
        },
      ])
      setAddingItem(null)
      setStage('correcting')
    } catch {
      setStatusMessage(`No product found for barcode ${code}. Try searching by name instead.`)
    }
  }

  async function handleManualSelect(result: FoodSearchResult) {
    const detail = await getFoodDetail(result.fdc_id, 100)
    setSource((prev) => (prev === 'photo' ? 'photo' : 'manual'))
    setItems((prev) => [
      ...prev,
      {
        key: newKey(),
        name: result.description,
        fdc_id: result.fdc_id,
        off_barcode: null,
        grams: 100,
        confidence: 1,
        nutrients: detail.nutrients,
        calories_low: null,
        calories_high: null,
      },
    ])
    setAddingItem(null)
    setStatusMessage(null)
    setStage('correcting')
  }

  async function handleSave() {
    const payload: MealIn = {
      source,
      items: items.map((it) => ({
        name: it.name,
        fdc_id: it.fdc_id,
        off_barcode: it.off_barcode,
        grams: it.grams,
        confidence: it.confidence,
      })),
    }
    await saveMeal(payload)
    setHistoryKey((k) => k + 1)
    setDashboardKey((k) => k + 1)
    resetToHome()
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Nutrition Tracker</h1>
        <nav className="flex gap-1 rounded-full border border-neutral-300 p-1 dark:border-neutral-700">
          <button
            onClick={() => setView('log')}
            className={`rounded-full px-4 py-1 text-sm font-medium ${
              view === 'log' ? 'bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900' : ''
            }`}
          >
            Log
          </button>
          <button
            onClick={() => setView('dashboard')}
            className={`rounded-full px-4 py-1 text-sm font-medium ${
              view === 'dashboard' ? 'bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900' : ''
            }`}
          >
            Dashboard
          </button>
        </nav>
      </header>

      {view === 'dashboard' && (
        <>
          <Dashboard refreshKey={dashboardKey} />
          <BodyWeightLogger onLogged={() => setDashboardKey((k) => k + 1)} />
          {showProfileForm ? (
            <ProfileForm
              onSaved={() => {
                setShowProfileForm(false)
                setDashboardKey((k) => k + 1)
              }}
            />
          ) : (
            <button onClick={() => setShowProfileForm(true)} className="self-start text-sm text-blue-600 underline dark:text-blue-400">
              Edit profile
            </button>
          )}
          <SettingsPanel />
        </>
      )}

      {view === 'log' && stage === 'home' && (
        <>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setStage('photo')}
              className="rounded-full bg-blue-600 px-5 py-3 font-medium text-white hover:bg-blue-700"
            >
              Log a meal photo
            </button>
            <button
              onClick={() => setStage('barcode')}
              className="rounded-full bg-emerald-600 px-5 py-3 font-medium text-white hover:bg-emerald-700"
            >
              Scan a barcode
            </button>
            <button
              onClick={() => setStage('manual-add')}
              className="rounded-full border border-neutral-300 px-5 py-3 font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              Search foods
            </button>
          </div>

          <section>
            <h2 className="mb-2 font-medium">Recent meals</h2>
            <MealHistory refreshKey={historyKey} onRelogged={() => setHistoryKey((k) => k + 1)} />
          </section>
        </>
      )}

      {view === 'log' && stage === 'photo' && (
        <>
          <CameraCapture onCapture={handlePhotoCaptured} />
          <button onClick={resetToHome} className="text-sm text-neutral-500 underline">
            Cancel
          </button>
        </>
      )}

      {view === 'log' && stage === 'barcode' && (
        <BarcodeScanner onDetected={handleBarcodeDetected} onCancel={resetToHome} />
      )}

      {view === 'log' && stage === 'analyzing' && <p className="text-center text-neutral-500">Analyzing photo…</p>}

      {view === 'log' && stage === 'manual-add' && (
        <>
          {statusMessage && <p className="text-sm text-neutral-500">{statusMessage}</p>}
          <ManualSearch onSelect={handleManualSelect} />
          <div className="flex gap-4">
            <button onClick={() => setStage('barcode')} className="text-sm text-blue-600 underline dark:text-blue-400">
              Scan a barcode instead
            </button>
            <button onClick={resetToHome} className="text-sm text-neutral-500 underline">
              Cancel
            </button>
          </div>
        </>
      )}

      {view === 'log' && stage === 'correcting' && (
        <>
          <CorrectionScreen items={items} onChange={setItems} />

          <section className="rounded-lg border border-dashed border-neutral-300 p-4 dark:border-neutral-700">
            {addingItem === 'search' && <ManualSearch onSelect={handleManualSelect} />}
            {addingItem === 'barcode' && <BarcodeScanner onDetected={handleBarcodeDetected} onCancel={() => setAddingItem(null)} />}
            {addingItem === null && (
              <div className="flex gap-4">
                <button onClick={() => setAddingItem('search')} className="text-sm text-blue-600 underline dark:text-blue-400">
                  + Add another item
                </button>
                <button onClick={() => setAddingItem('barcode')} className="text-sm text-blue-600 underline dark:text-blue-400">
                  + Scan another barcode
                </button>
              </div>
            )}
          </section>

          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={items.length === 0}
              className="rounded-full bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Save
            </button>
            <button onClick={resetToHome} className="text-sm text-neutral-500 underline">
              Discard
            </button>
          </div>
        </>
      )}
    </div>
  )
}
