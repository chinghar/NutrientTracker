"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { getSettings, saveSettings, type VisionProviderId } from "@/lib/db/db";
import { exportAllData, importAllData } from "@/lib/db/export";
import { AnthropicBrowserProvider } from "@/lib/vision/anthropic-provider";
import { isOllamaAvailable } from "@/lib/vision/ollama-provider";

type TestStatus = { state: "idle" } | { state: "testing" } | { state: "success" } | { state: "error"; message: string };
type ImportStatus =
  | { state: "idle" }
  | { state: "done"; mealCount: number; weightLogCount: number }
  | { state: "error"; message: string };

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState("");
  const [visionProvider, setVisionProvider] = useState<VisionProviderId>("anthropic");
  const [plateDiameterCm, setPlateDiameterCm] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved">("idle");
  const [testStatus, setTestStatus] = useState<TestStatus>({ state: "idle" });
  const [importStatus, setImportStatus] = useState<ImportStatus>({ state: "idle" });
  const [ollamaAvailable, setOllamaAvailable] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getSettings().then((settings) => {
      setApiKey(settings.anthropicApiKey ?? "");
      setVisionProvider(settings.visionProvider);
      setPlateDiameterCm(settings.plateDiameterCm != null ? String(settings.plateDiameterCm) : "");
      setOllamaAvailable(isOllamaAvailable());
      setLoaded(true);
    });
  }, []);

  async function handleSave() {
    const parsedDiameter = parseFloat(plateDiameterCm);
    await saveSettings({
      anthropicApiKey: apiKey || undefined,
      visionProvider,
      plateDiameterCm: Number.isFinite(parsedDiameter) && parsedDiameter > 0 ? parsedDiameter : undefined,
    });
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
  }

  async function handleTestKey() {
    setTestStatus({ state: "testing" });
    const provider = new AnthropicBrowserProvider(apiKey);
    const result = await provider.testKey();
    setTestStatus(result.ok ? { state: "success" } : { state: "error", message: result.error });
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
    return <main className="mx-auto max-w-lg p-6 text-sm text-neutral-500">Loading settings…</main>;
  }

  return (
    <main className="mx-auto max-w-lg p-6 space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Your API key is stored only in this browser (IndexedDB) and is sent directly to Anthropic — it never
          passes through any server.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Vision provider</h2>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="visionProvider"
              checked={visionProvider === "anthropic"}
              onChange={() => setVisionProvider("anthropic")}
            />
            Claude (your API key)
          </label>
          {ollamaAvailable && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="visionProvider"
                checked={visionProvider === "ollama"}
                onChange={() => setVisionProvider("ollama")}
              />
              Ollama (local dev only)
            </label>
          )}
        </div>
      </section>

      {visionProvider === "anthropic" && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium">Anthropic API key</h2>
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setTestStatus({ state: "idle" });
            }}
            placeholder="sk-ant-..."
            className="w-full rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleTestKey}
              disabled={!apiKey || testStatus.state === "testing"}
              className="rounded border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-neutral-700"
            >
              {testStatus.state === "testing" ? "Testing…" : "Test key"}
            </button>
            {testStatus.state === "success" && <span className="text-sm text-neutral-500">Key works.</span>}
            {testStatus.state === "error" && (
              <span className="text-sm text-neutral-500">{testStatus.message}</span>
            )}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Plate size calibration</h2>
        <p className="text-sm text-neutral-500">
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
            className="w-24 rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <span className="text-sm text-neutral-500">cm</span>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          className="rounded bg-neutral-900 px-4 py-2 text-sm text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          Save
        </button>
        {saveStatus === "saved" && <span className="text-sm text-neutral-500">Saved.</span>}
      </div>

      <section className="space-y-3 border-t border-neutral-200 pt-6 dark:border-neutral-800">
        <h2 className="text-sm font-medium">Backup</h2>
        <p className="text-sm text-neutral-500">
          There is no server, so this export is your only backup. It does not include your API key.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExport}
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700"
          >
            Export data
          </button>
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700"
          >
            Import data
          </button>
          <input ref={importInputRef} type="file" accept="application/json" onChange={handleImportFile} className="hidden" />
        </div>
        {importStatus.state === "done" && (
          <p className="text-sm text-neutral-500">
            Imported {importStatus.mealCount} meal(s) and {importStatus.weightLogCount} weight log(s).
          </p>
        )}
        {importStatus.state === "error" && <p className="text-sm text-neutral-500">{importStatus.message}</p>}
      </section>
    </main>
  );
}
