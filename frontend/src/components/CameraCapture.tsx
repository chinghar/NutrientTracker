import { useEffect, useRef, useState } from 'react'

interface Props {
  onCapture: (blob: Blob) => void
}

export function CameraCapture({ onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [dropError, setDropError] = useState<string | null>(null)
  const dragCounter = useRef(0)

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

  function acceptFile(file: File | undefined | null) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setDropError('That file isn’t an image. Try a JPEG or PNG photo.')
      return
    }
    setDropError(null)
    onCapture(file)
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    acceptFile(e.target.files?.[0])
  }

  function onDragEnter(e: React.DragEvent) {
    e.preventDefault()
    dragCounter.current += 1
    if (e.dataTransfer.types.includes('Files')) setIsDragging(true)
  }

  function onDragOver(e: React.DragEvent) {
    // Required for onDrop to fire at all -- browsers default to rejecting drops.
    e.preventDefault()
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault()
    dragCounter.current -= 1
    if (dragCounter.current <= 0) {
      dragCounter.current = 0
      setIsDragging(false)
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    dragCounter.current = 0
    setIsDragging(false)
    acceptFile(e.dataTransfer.files?.[0])
  }

  return (
    <div
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`flex flex-col items-center gap-4 rounded-lg border-2 border-dashed p-4 transition-colors ${
        isDragging
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
          : 'border-transparent'
      }`}
    >
      {cameraError ? (
        <p className="text-sm text-neutral-500">Camera unavailable ({cameraError}). Use file upload instead.</p>
      ) : (
        <video ref={videoRef} autoPlay playsInline muted className="w-full max-w-md rounded-lg bg-black" />
      )}

      {isDragging && (
        <p className="text-sm font-medium text-blue-600 dark:text-blue-400">Drop the photo to log it</p>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3">
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
        <span className="text-sm text-neutral-400">or drag and drop a photo anywhere here</span>
      </div>

      {dropError && <p className="text-sm text-neutral-500">{dropError}</p>}
    </div>
  )
}
