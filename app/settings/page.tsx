"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { getSettings, saveSettings, type VisionProviderId } from "@/lib/db/db";
import { exportAllData, importAllData } from "@/lib/db/export";
import { AnthropicBrowserProvider } from "@/lib/vision/anthropic-provider";
import { isOllamaAvailable } from "@/lib/vision/ollama-provider";
import GeminiKeySetup from "@/components/GeminiKeySetup";
import Button from "@/components/ui/Button";
import Rule from "@/components/ui/Rule";

const INPUT_CLASS = "min-h-11 rounded-lg border-2 border-toast/40 bg-white px-3 py-2 text-base text-cocoa";

type TestStatus = { state: "idle" } | { state: "testing" } | { state: "success" } | { state: "error"; message: string };
type ImportStatus =
  | { state: "idle" }
  | { state: "done"; mealCount: number; weightLogCount: number }
  | { state: "error"; message: string };

export default function SettingsPage() {
  const [anthropicApiKey, setAnthropicApiKey] = useState("");
  const [visionProvider, setVisionProvider] = useState<VisionProviderId>("gemini");
  const [plateDiameterCm, setPlateDiameterCm] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved">("idle");
  const [anthropicTestStatus, setAnthropicTestStatus] = useState<TestStatus>({ state: "idle" });
  const [importStatus, setImportStatus] = useState<ImportStatus>({ state: "idle" });
  const [ollamaAvailable, setOllamaAvailable] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getSettings().then((settings) => {
      setAnthropicApiKey(settings.anthropicApiKey ?? "");
      setVisionProvider(settings.visionProvider);
      setPlateDiameterCm(settings.plateDiameterCm != null ? String(settings.plateDiameterCm) : "");
      setOllamaAvailable(isOllamaAvailable());
      setLoaded(true);
    });
  }, []);

  async function handleSave() {
    const parsedDiameter = parseFloat(plateDiameterCm);
    await saveSettings({
      anthropicApiKey: anthropicApiKey || undefined,
      visionProvider,
      plateDiameterCm: Number.isFinite(parsedDiameter) && parsedDiameter > 0 ? parsedDiameter : undefined,
    });
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
  }

  async function handleTestAnthropicKey() {
    setAnthropicTestStatus({ state: "testing" });
    const provider = new AnthropicBrowserProvider(anthropicApiKey);
    const result = await provider.testKey();
    setAnthropicTestStatus(result.ok ? { state: "success" } : { state: "error", message: result.error });
  }

  async function handleExport() {
    const data = await exportAllData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nutrition-app-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!confirm("Import this file? It will restore your profile/settings and add its logged meals and bodyweight history.")) return;
    try {
      const text = await file.text();
      const { mealCount, weightLogCount } = await importAllData(text);
      setImportStatus({ state: "done", mealCount, weightLogCount });
    } catch (err) {
      setImportStatus({ state: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  if (!loaded) {
    return <main className="mx-auto max-w-lg p-6 text-sm text-toast">Loading settings…</main>;
  }

  return (
    <main className="mx-auto max-w-lg p-6 space-y-8">
      <div>
        <h1 className="font-display text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-toast">
          Your API key is stored only in this browser (IndexedDB) and is sent directly to the provider you choose —
          it never passes through any server.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-bold">Vision provider</h2>
        <div className="flex flex-col gap-1">
          <label className="flex min-h-11 items-center gap-2 text-base">
            <input
              type="radio"
              name="visionProvider"
              checked={visionProvider === "gemini"}
              onChange={() => setVisionProvider("gemini")}
              className="h-5 w-5"
            />
            Gemini (free API key, recommended)
          </label>
          <label className="flex min-h-11 items-center gap-2 text-base">
            <input
              type="radio"
              name="visionProvider"
              checked={visionProvider === "anthropic"}
              onChange={() => setVisionProvider("anthropic")}
              className="h-5 w-5"
            />
            Claude (Anthropic API key)
          </label>
          {ollamaAvailable && (
            <label className="flex min-h-11 items-center gap-2 text-base">
              <input
                type="radio"
                name="visionProvider"
                checked={visionProvider === "ollama"}
                onChange={() => setVisionProvider("ollama")}
                className="h-5 w-5"
              />
              Ollama (local dev only)
            </label>
          )}
        </div>
      </section>

      {visionProvider === "gemini" && (
        <section className="space-y-3">
          <Rule color="avocado" />
          <h2 className="text-sm font-bold">Gemini API key</h2>
          <GeminiKeySetup />
        </section>
      )}

      {visionProvider === "anthropic" && (
        <section className="space-y-3">
          <Rule color="avocado" />
          <h2 className="text-sm font-bold">Anthropic API key</h2>
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={anthropicApiKey}
            onChange={(e) => {
              setAnthropicApiKey(e.target.value);
              setAnthropicTestStatus({ state: "idle" });
            }}
            placeholder="sk-ant-..."
            className={`w-full ${INPUT_CLASS}`}
          />
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleTestAnthropicKey}
              disabled={!anthropicApiKey || anthropicTestStatus.state === "testing"}
            >
              {anthropicTestStatus.state === "testing" ? "Testing…" : "Test key"}
            </Button>
            {anthropicTestStatus.state === "success" && <span className="text-sm font-semibold text-cocoa">Key works.</span>}
            {anthropicTestStatus.state === "error" && <span className="text-sm text-cocoa">{anthropicTestStatus.message}</span>}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-bold">Plate size calibration</h2>
        <p className="text-sm text-toast">
          Your typical plate diameter, passed to the vision model as a scale reference when estimating portions.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            step={0.5}
            value={plateDiameterCm}
            onChange={(e) => setPlateDiameterCm(e.target.value)}
            placeholder="27"
            className={`w-24 ${INPUT_CLASS}`}
          />
          <span className="text-sm text-toast">cm</span>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <Button type="button" variant="primary" onClick={handleSave}>
          Save
        </Button>
        {saveStatus === "saved" && <span className="text-sm font-semibold text-cocoa">Saved.</span>}
      </div>

      <Rule color="poppy" />

      <section className="space-y-3">
        <h2 className="text-sm font-bold">Backup</h2>
        <p className="text-sm text-toast">
          There is no server, so this export is your only backup. It does not include your API keys.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={handleExport}>
            Export data
          </Button>
          <Button type="button" variant="outline" onClick={() => importInputRef.current?.click()}>
            Import data
          </Button>
          <input ref={importInputRef} type="file" accept="application/json" onChange={handleImportFile} className="hidden" />
        </div>
        {importStatus.state === "done" && (
          <p className="text-sm text-cocoa">
            Imported {importStatus.mealCount} meal(s) and {importStatus.weightLogCount} weight log(s).
          </p>
        )}
        {importStatus.state === "error" && <p className="text-sm text-cocoa">{importStatus.message}</p>}
      </section>
    </main>
  );
}
