import { useEffect, useRef, useState } from 'react'

interface Props {
  onCapture: (blob: Blob) => void
}

export function CameraCapture({ onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [cameraReady, setCameraReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'environment' } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
        setCameraReady(true)
      })
      .catch((err) => setCameraError(err instanceof Error ? err.message : String(err)))

    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  function capture() {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    canvas.toBlob((blob) => blob && onCapture(blob), 'image/jpeg', 0.9)
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onCapture(file)
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {cameraError ? (
        <p className="text-sm text-neutral-500">Camera unavailable ({cameraError}). Use file upload instead.</p>
      ) : (
        <video ref={videoRef} autoPlay playsInline muted className="w-full max-w-md rounded-lg bg-black" />
      )}
      <div className="flex gap-3">
        {cameraReady && (
          <button
            onClick={capture}
            className="rounded-full bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700"
          >
            Capture
          </button>
        )}
        <label className="cursor-pointer rounded-full border border-neutral-300 px-6 py-3 font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800">
          Upload photo
          <input type="file" accept="image/*" className="hidden" onChange={onFileChange} />
        </label>
      </div>
    </div>
  )
}
