"use client";

import { useEffect, useState } from "react";
import { getSettings, saveSettings } from "@/lib/db/db";
import { GEMINI_DEFAULT_MODEL, GEMINI_MODELS, GeminiBrowserProvider } from "@/lib/vision/gemini-provider";
import Button from "@/components/ui/Button";

/**
 * Google migrated Gemini API keys from the old "AIza..." Standard-key
 * format to a new "AQ...." Auth-key format, and as of September 2026 is
 * rejecting the old format outright — AI Studio now issues "AQ." keys by
 * default. Both are checked so a still-valid legacy key isn't rejected.
 */
const VALID_PREFIXES = ["AQ.", "AIza"];
const MIN_KEY_LENGTH = 20;

const INPUT_CLASS = "w-full min-h-11 rounded-lg border-2 border-toast/40 bg-white px-3 py-2 text-base text-cocoa";

function validateKeyFormat(key: string): string | null {
  const trimmed = key.trim();
  if (!trimmed) return null;
  const looksValid = VALID_PREFIXES.some((p) => trimmed.startsWith(p)) && trimmed.length >= MIN_KEY_LENGTH;
  if (!looksValid) {
    return 'That doesn\'t look like a Gemini API key — current keys start with "AQ." (older ones start with "AIza"). Double-check you copied the API key itself, not something else from the page.';
  }
  return null;
}

type TestStatus = { state: "idle" } | { state: "testing" } | { state: "success" } | { state: "error"; message: string };

interface GeminiKeySetupProps {
  /** Called after a successful save, so a caller like the welcome screen can re-check setup status. */
  onSaved?: () => void;
}

/** The full Gemini key onboarding step: get-a-key instructions, format validation, model choice, and a live test. Reused in Settings and on the welcome screen so this logic isn't scattered. */
export default function GeminiKeySetup({ onSaved }: GeminiKeySetupProps) {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(GEMINI_DEFAULT_MODEL);
  const [loaded, setLoaded] = useState(false);
  const [testStatus, setTestStatus] = useState<TestStatus>({ state: "idle" });
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved">("idle");
  const [formatError, setFormatError] = useState<string | null>(null);

  useEffect(() => {
    getSettings().then((settings) => {
      setApiKey(settings.geminiApiKey ?? "");
      setModel(settings.geminiModel ?? GEMINI_DEFAULT_MODEL);
      setLoaded(true);
    });
  }, []);

  async function handleTestKey() {
    const err = validateKeyFormat(apiKey);
    if (err) {
      setFormatError(err);
      return;
    }
    setFormatError(null);
    setTestStatus({ state: "testing" });
    const provider = new GeminiBrowserProvider(apiKey.trim(), model);
    const result = await provider.testKey();
    setTestStatus(result.ok ? { state: "success" } : { state: "error", message: result.error });
  }

  async function handleSave() {
    const err = validateKeyFormat(apiKey);
    if (err) {
      setFormatError(err);
      return;
    }
    setFormatError(null);
    await saveSettings({ geminiApiKey: apiKey.trim() || undefined, geminiModel: model, visionProvider: "gemini" });
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
    onSaved?.();
  }

  if (!loaded) return <p className="text-sm text-toast">Loading…</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-cocoa">Free, takes about two minutes, no credit card.</p>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-cocoa">
        <li>
          Open{" "}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
            className="font-bold underline underline-offset-2"
          >
            Get a free Gemini key
          </a>{" "}
          and sign in with a Google account.
        </li>
        <li>Click Create API key.</li>
        <li>Paste it back here.</li>
      </ol>
      <p className="text-xs text-toast">
        In the EEA, UK, or Switzerland? Google requires billing to be enabled on the project even for
        free-tier-eligible models there.
      </p>

      <input
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={apiKey}
        onChange={(e) => {
          setApiKey(e.target.value);
          setTestStatus({ state: "idle" });
          setFormatError(null);
        }}
        placeholder="AQ...."
        className={INPUT_CLASS}
      />
      {formatError && <p className="text-sm font-semibold text-cocoa">{formatError}</p>}

      <label className="block space-y-1">
        <span className="text-sm font-semibold text-cocoa">Model</span>
        <select value={model} onChange={(e) => setModel(e.target.value)} className={INPUT_CLASS}>
          {GEMINI_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-toast">
        If a model is rejected or unavailable, the exact error will show below — try a different one from this list.
      </p>

      <p className="text-xs text-toast">
        Stored only on this device, in this browser. Never uploaded anywhere except directly to Google when you use it.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" onClick={handleTestKey} disabled={!apiKey || testStatus.state === "testing"}>
          {testStatus.state === "testing" ? "Testing…" : "Test key"}
        </Button>
        <Button type="button" variant="primary" onClick={handleSave} disabled={!apiKey}>
          Save
        </Button>
        {saveStatus === "saved" && <span className="text-sm font-semibold text-cocoa">Saved.</span>}
        {testStatus.state === "success" && <span className="text-sm font-semibold text-cocoa">Key works.</span>}
        {testStatus.state === "error" && <span className="text-sm text-cocoa">{testStatus.message}</span>}
      </div>
    </div>
  );
}
