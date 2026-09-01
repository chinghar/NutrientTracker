import { BrowserMultiFormatReader } from '@zxing/browser'
import { useEffect, useRef, useState } from 'react'

interface Props {
  onDetected: (code: string) => void
  onCancel: () => void
}

export function BarcodeScanner({ onDetected, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [manualCode, setManualCode] = useState('')

  useEffect(() => {
    const reader = new BrowserMultiFormatReader()
    let controls: { stop: () => void } | undefined
    let cancelled = false
    let detected = false

    reader
      .decodeFromConstraints({ video: { facingMode: 'environment' } }, videoRef.current!, (result, err) => {
        if (cancelled || detected) return
        if (result) {
          detected = true
          onDetected(result.getText())
          return
        }
        // NotFoundException fires continuously while no barcode is in
        // frame -- that's the expected steady state, not a real error.
        if (err && err.name !== 'NotFoundException') {
          setError(err.message)
        }
      })
      .then((c) => {
        controls = c
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))

    return () => {
      cancelled = true
      controls?.stop()
    }
  }, [onDetected])

  return (
    <div className="flex flex-col items-center gap-4">
      <video ref={videoRef} className="w-full max-w-md rounded-lg bg-black" muted />
      {error && <p className="text-sm text-neutral-500">Camera scanning unavailable: {error}</p>}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (manualCode.trim()) onDetected(manualCode.trim())
        }}
      >
        <input
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value)}
          placeholder="Or type the barcode number"
          className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          type="submit"
          className="rounded bg-neutral-800 px-4 py-2 text-white dark:bg-neutral-200 dark:text-neutral-900"
        >
          Look up
        </button>
      </form>
      <button onClick={onCancel} className="text-sm text-neutral-500 underline">
        Cancel
      </button>
    </div>
  )
}
