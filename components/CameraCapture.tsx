"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";

interface CameraCaptureProps {
  onCapture: (blob: Blob) => void;
  onCancel: () => void;
}

type Mode = "choice" | "camera" | "upload";

/**
 * Lets the user choose between taking a live photo (getUserMedia) or
 * uploading one (click-to-browse or drag-and-drop) before committing to
 * either path — so camera permission is only requested if they actually
 * pick "Take a photo".
 */
export default function CameraCapture({ onCapture, onCancel }: CameraCaptureProps) {
  const [mode, setMode] = useState<Mode>("choice");

  return (
    <div className="space-y-3">
      {mode === "choice" && <ChoiceScreen onChoose={setMode} onCancel={onCancel} />}
      {mode === "camera" && <CameraScreen onCapture={onCapture} onBack={() => setMode("choice")} />}
      {mode === "upload" && <UploadScreen onCapture={onCapture} onBack={() => setMode("choice")} />}
    </div>
  );
}

function ChoiceScreen({ onChoose, onCancel }: { onChoose: (mode: Mode) => void; onCancel: () => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-500">How would you like to add a photo?</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChoose("camera")}
          className="rounded bg-neutral-900 px-4 py-3 text-sm text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          Take a photo
        </button>
        <button
          type="button"
          onClick={() => onChoose("upload")}
          className="rounded border border-neutral-300 px-4 py-3 text-sm dark:border-neutral-700"
        >
          Upload a photo
        </button>
      </div>
      <button type="button" onClick={onCancel} className="text-sm text-neutral-500 underline">
        Cancel
      </button>
    </div>
  );
}

function CameraScreen({ onCapture, onBack }: { onCapture: (blob: Blob) => void; onBack: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      } catch {
        if (!cancelled) setCameraError("Camera is unavailable or access was denied. Go back and upload a photo instead.");
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
        <button type="button" onClick={onBack} className="text-sm text-neutral-500 underline">
          Back
        </button>
      </div>
    </div>
  );
}

function UploadScreen({ onCapture, onBack }: { onCapture: (blob: Blob) => void; onBack: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);

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
      className={`space-y-3 rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
        isDraggingOver
          ? "border-neutral-400 bg-neutral-100 dark:bg-neutral-900"
          : "border-neutral-200 dark:border-neutral-800"
      }`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <p className="text-sm text-neutral-500">
        {isDraggingOver ? "Drop the photo to use it" : "Drag and drop an image here"}
      </p>
      {dropError && <p className="text-sm text-neutral-500">{dropError}</p>}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded bg-neutral-900 px-4 py-2 text-sm text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          Choose file
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
        <button type="button" onClick={onBack} className="text-sm text-neutral-500 underline">
          Back
        </button>
      </div>
    </div>
  );
}
