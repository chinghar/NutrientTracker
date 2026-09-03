"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";

interface CameraCaptureProps {
  onCapture: (blob: Blob) => void;
  onCancel: () => void;
}

/**
 * Live camera capture via getUserMedia, with a file-upload fallback (click
 * or drag-and-drop) when the camera is unavailable or denied.
 */
export default function CameraCapture({ onCapture, onCancel }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);

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

  function handleDragEnter(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) setIsDraggingOver(true);
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    // Required for onDrop to fire at all.
    e.preventDefault();
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setIsDraggingOver(false);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDraggingOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setDropError("That file isn't an image. Drop a photo (JPEG, PNG, etc.) instead.");
      return;
    }
    setDropError(null);
    onCapture(file);
  }

  return (
    <div
      className={`space-y-3 rounded-lg p-2 transition-colors ${
        isDraggingOver ? "bg-neutral-100 outline-2 outline-dashed outline-neutral-400 dark:bg-neutral-900" : ""
      }`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {!cameraError && (
        <div className="overflow-hidden rounded bg-black">
          <video ref={videoRef} className="w-full" muted playsInline />
        </div>
      )}
      {cameraError && <p className="text-sm text-neutral-500">{cameraError}</p>}
      {isDraggingOver && <p className="text-center text-sm text-neutral-500">Drop the photo to use it</p>}
      {dropError && <p className="text-sm text-neutral-500">{dropError}</p>}
      <div className="flex flex-wrap items-center gap-2">
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
        <span className="text-xs text-neutral-400">or drag and drop an image anywhere here</span>
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
