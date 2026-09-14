"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import GeminiKeySetup from "@/components/GeminiKeySetup";
import Button from "@/components/ui/Button";
import Rule from "@/components/ui/Rule";
import { useSetupStatus } from "@/lib/onboarding/status";

export default function WelcomeGatePage() {
  const router = useRouter();
  const status = useSetupStatus();

  useEffect(() => {
    if (!status.loading && status.isReady) {
      router.replace("/dashboard");
    }
  }, [status, router]);

  if (status.loading || status.isReady) {
    return <main className="mx-auto max-w-lg p-6 text-sm text-toast">Loading…</main>;
  }

  return (
    <main className="mx-auto max-w-lg space-y-8 p-6">
      <div>
        <h1 className="font-display text-3xl">Get set up</h1>
        <p className="mt-1 text-sm text-toast">Two steps, then photograph your first meal.</p>
      </div>

      <section className="space-y-4">
        <StepHeading n={1} title="Connect a vision provider" done={status.hasKey} />
        {status.hasKey ? (
          <p className="text-sm text-toast">
            Connected.{" "}
            <Link href="/settings" className="font-semibold text-cocoa underline underline-offset-2">
              Change provider or model
            </Link>
            .
          </p>
        ) : (
          <>
            <GeminiKeySetup onSaved={status.refresh} />
            <p className="text-xs text-toast">
              Prefer Claude, or run Ollama locally for development? Configure either in{" "}
              <Link href="/settings" className="font-semibold text-cocoa underline underline-offset-2">
                Settings
              </Link>
              .
            </p>
          </>
        )}
      </section>

      <Rule color="avocado" />

      <section className="space-y-4">
        <StepHeading n={2} title="Complete your profile" done={status.hasProfile} />
        {status.hasProfile ? (
          <p className="text-sm text-toast">
            Set.{" "}
            <Link href="/profile" className="font-semibold text-cocoa underline underline-offset-2">
              Update it
            </Link>
            .
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-toast">
              Your age, sex, weight, height, and goal drive your daily calorie and macro targets.
            </p>
            <Link href="/profile">
              <Button variant="primary">Set up your profile</Button>
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}

function StepHeading({ n, title, done }: { n: number; title: string; done: boolean }) {
  return (
    <div className="flex items-center gap-3">
      {/* Cocoa background regardless of state: white/Cocoa is 16.15:1, safe at any text size, unlike Avocado at small sizes. */}
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cocoa text-sm font-bold text-white">
        {done ? "✓" : n}
      </span>
      <h2 className="text-base font-bold">{title}</h2>
    </div>
  );
}
