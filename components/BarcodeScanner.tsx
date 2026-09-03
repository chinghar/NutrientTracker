"use client";

import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";

interface BarcodeDetectorResult {
  rawValue: string;
}
interface BarcodeDetectorInstance {
  detect(source: CanvasImageSource): Promise<BarcodeDetectorResult[]>;
}
interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): BarcodeDetectorInstance;
}

const BARCODE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];

interface BarcodeScannerProps {
  onDetected: (barcode: string) => void;
  onCancel: () => void;
}

/** Scans a barcode via the native BarcodeDetector API where available, falling back to ZXing otherwise. */
export default function BarcodeScanner({ onDetected, onCancel }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualEntry, setManualEntry] = useState("");

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let zxingControls: IScannerControls | null = null;
    let rafId: number | null = null;

    async function startNative(DetectorCtor: BarcodeDetectorConstructor) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      } catch {
        if (!cancelled) setError("Camera access was denied or is unavailable. Enter the barcode number instead.");
        return;
      }
      if (cancelled || !videoRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      const detector = new DetectorCtor({ formats: BARCODE_FORMATS });
      const scanFrame = async () => {
        if (cancelled || !videoRef.current) return;
        try {
          const results = await detector.detect(videoRef.current);
          if (results.length > 0) {
            onDetected(results[0].rawValue);
            return;
          }
        } catch {
          // transient per-frame detection failure — keep scanning
        }
        rafId = requestAnimationFrame(scanFrame);
      };
      rafId = requestAnimationFrame(scanFrame);
    }

    async function startZXing() {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (cancelled || !videoRef.current) return;
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
          if (result && !cancelled) {
            onDetected(result.getText());
            controls.stop();
          }
        });
        zxingControls = controls;
      } catch {
        if (!cancelled) setError("Camera access was denied or is unavailable. Enter the barcode number instead.");
      }
    }

    const DetectorCtor = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
    if (typeof DetectorCtor === "function") {
      startNative(DetectorCtor);
    } else {
      startZXing();
    }

    return () => {
      cancelled = true;
      if (rafId != null) cancelAnimationFrame(rafId);
      zxingControls?.stop();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onDetected]);

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded bg-black">
        <video ref={videoRef} className="w-full" muted playsInline />
      </div>
      {error && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (manualEntry.trim()) onDetected(manualEntry.trim());
          }}
        >
          <input
            value={manualEntry}
            onChange={(e) => setManualEntry(e.target.value)}
            placeholder="Barcode number"
            inputMode="numeric"
            className="flex-1 rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <button type="submit" className="rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700">
            Look up
          </button>
        </form>
      )}
      <button type="button" onClick={onCancel} className="text-sm text-neutral-500 underline">
        Cancel
      </button>
    </div>
  );
}
