"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSetupStatus } from "@/lib/onboarding/status";

const DISMISS_KEY = "setup-banner-dismissed";

/** Persistent while setup is incomplete, dismissible for the rest of this browser session (sessionStorage). */
export default function SetupBanner() {
  const status = useSetupStatus();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Deferred a microtask so this reads as an async continuation rather than
    // a synchronous setState-in-effect (matches the SSR-hydration-safe
    // pattern used elsewhere: render `false` on the server, correct after mount).
    Promise.resolve().then(() => {
      try {
        setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
      } catch {
        // sessionStorage unavailable (e.g. private browsing) — banner just always shows until setup completes
      }
    });
  }, []);

  function handleDismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
  }

  if (status.loading || status.isReady || dismissed) return null;

  // Cocoa on Marigold: 7.87:1, clears AA for normal text.
  return (
    <div className="flex items-center justify-between gap-3 bg-marigold px-6 py-2 text-sm text-cocoa">
      <p>
        Finish setup to start logging meals —{" "}
        <Link href="/" className="font-bold underline underline-offset-2">
          two steps left
        </Link>
        .
      </p>
      <button
        type="button"
        onClick={handleDismiss}
        className="min-h-11 shrink-0 px-2 font-semibold underline underline-offset-2"
      >
        Dismiss
      </button>
    </div>
  );
}
