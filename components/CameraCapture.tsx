"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import Button from "@/components/ui/Button";

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
      <p className="text-sm text-toast">How would you like to add a photo?</p>
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="primary" onClick={() => onChoose("camera")}>
          Take a photo
        </Button>
        <Button type="button" variant="outline" onClick={() => onChoose("upload")}>
          Upload a photo
        </Button>
      </div>
      <Button type="button" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
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
        <div className="overflow-hidden rounded-lg border-4 border-cocoa">
          <video ref={videoRef} className="w-full" muted playsInline />
        </div>
      )}
      {cameraError && <p className="text-sm text-toast">{cameraError}</p>}
      <div className="flex flex-wrap gap-3">
        {!cameraError && (
          <Button type="button" variant="primary" onClick={handleTakePhoto} disabled={!ready}>
            Take photo
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={onBack}>
          Back
        </Button>
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
      className={`space-y-3 rounded-lg border-4 border-dashed p-6 text-center transition-colors ${
        isDraggingOver ? "border-poppy bg-marigold/10" : "border-avocado"
      }`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <p className="text-sm text-toast">{isDraggingOver ? "Drop the photo to use it" : "Drag and drop an image here"}</p>
      {dropError && <p className="text-sm text-cocoa">{dropError}</p>}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button type="button" variant="primary" onClick={() => fileInputRef.current?.click()}>
          Choose file
        </Button>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
        <Button type="button" variant="ghost" onClick={onBack}>
          Back
        </Button>
      </div>
    </div>
  );
}
