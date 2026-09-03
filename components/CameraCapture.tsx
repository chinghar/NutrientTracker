"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";

interface CameraCaptureProps {
  onCapture: (blob: Blob) => void;
  onCancel: () => void;
}

/** Live camera capture via getUserMedia, with a file-upload fallback when the camera is unavailable or denied. */
export default function CameraCapture({ onCapture, onCancel }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      } catch {
        if (!cancelled) setCameraError("Camera is unavailable or access was denied. Upload a photo instead.");
        return;
      }
      if (cancelled || !videoRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setReady(true);
    })();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function handleTakePhoto() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) onCapture(blob);
      },
      "image/jpeg",
      0.92,
    );
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onCapture(file);
  }

  return (
    <div className="space-y-3">
      {!cameraError && (
        <div className="overflow-hidden rounded bg-black">
          <video ref={videoRef} className="w-full" muted playsInline />
        </div>
      )}
      {cameraError && <p className="text-sm text-neutral-500">{cameraError}</p>}
      <div className="flex flex-wrap gap-2">
        {!cameraError && (
          <button
            type="button"
            onClick={handleTakePhoto}
            disabled={!ready}
            className="rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            Take photo
          </button>
        )}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded border border-neutral-300 px-4 py-2 text-sm dark:border-neutral-700"
        >
          Upload photo
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />
        <button type="button" onClick={onCancel} className="text-sm text-neutral-500 underline">
          Cancel
        </button>
      </div>
    </div>
  );
}
