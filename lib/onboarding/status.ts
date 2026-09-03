"use client";

import { useCallback, useEffect, useState } from "react";
import { getProfile, getSettings, type Settings } from "@/lib/db/db";

export interface SetupStatus {
  hasKey: boolean;
  hasProfile: boolean;
  isReady: boolean;
  /** True until the first IndexedDB read resolves — callers should avoid gating decisions on a loading status. */
  loading: boolean;
  /** Re-reads settings/profile from IndexedDB — call after an action that could change setup state (e.g. saving a key). */
  refresh: () => void;
}

const INITIAL_FIELDS = { hasKey: false, hasProfile: false, isReady: false, loading: true };

function hasConfiguredKey(settings: Settings): boolean {
  if (settings.visionProvider === "anthropic") return !!settings.anthropicApiKey;
  if (settings.visionProvider === "gemini") return !!settings.geminiApiKey;
  return true; // ollama needs no key
}

/**
 * The single source of truth for whether the app is set up: an API key for
 * the selected vision provider, and a saved profile. Every gated route
 * reads from this hook rather than re-deriving the check itself.
 */
export function useSetupStatus(): SetupStatus {
  const [fields, setFields] = useState(INITIAL_FIELDS);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [settings, profile] = await Promise.all([getSettings(), getProfile()]);
      if (cancelled) return;
      const hasKey = hasConfiguredKey(settings);
      const hasProfile = !!profile;
      setFields({ hasKey, hasProfile, isReady: hasKey && hasProfile, loading: false });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [version]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  return { ...fields, refresh };
}
