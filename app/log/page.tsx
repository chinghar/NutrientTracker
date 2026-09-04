"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CameraCapture from "@/components/CameraCapture";
import BarcodeScanner from "@/components/BarcodeScanner";
import FoodSearch from "@/components/FoodSearch";
import MealCorrectionScreen from "@/components/MealCorrectionScreen";
import { db, getSettings, type LoggedMeal, type Settings } from "@/lib/db/db";
import { loadFoodDb, searchFoods, type FoodDb } from "@/lib/food-db/repository";
import { lookupBarcode } from "@/lib/food-db/open-food-facts";
import { AnthropicBrowserProvider } from "@/lib/vision/anthropic-provider";
import { GeminiBrowserProvider } from "@/lib/vision/gemini-provider";
import { OllamaProvider } from "@/lib/vision/ollama-provider";
import type { MealAnalysis, VisionProvider } from "@/lib/vision/types";
import { makeLocalId, type MealItemDraft } from "@/lib/meal";
import { useSetupStatus } from "@/lib/onboarding/status";
import Button from "@/components/ui/Button";

type Step = "home" | "camera" | "barcode" | "search" | "analyzing" | "correcting";

function buildProvider(settings: Settings): VisionProvider | null {
  if (settings.visionProvider === "anthropic") {
    return settings.anthropicApiKey ? new AnthropicBrowserProvider(settings.anthropicApiKey) : null;
  }
  if (settings.visionProvider === "gemini") {
    return settings.geminiApiKey ? new GeminiBrowserProvider(settings.geminiApiKey, settings.geminiModel) : null;
  }
  return new OllamaProvider();
}

function matchAnalysisItems(analysis: MealAnalysis, foodDb: FoodDb): MealItemDraft[] {
  return analysis.items.map((item) => {
    const match = searchFoods(foodDb, item.foodQuery, 1)[0];
    return {
      localId: makeLocalId(),
      name: item.name,
      grams: item.estimatedGrams,
      confidence: item.confidence,
      nutrientsPer100g: match ? match.nutrients : {},
      source: match ? "usda" : "manual",
      reasoning: item.reasoning,
    };
  });
}

export default function LogPage() {
  const router = useRouter();
  const setupStatus = useSetupStatus();
  const [foodDb, setFoodDb] = useState<FoodDb | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [recentMeals, setRecentMeals] = useState<LoggedMeal[]>([]);
  const [step, setStep] = useState<Step>("home");
  const [items, setItems] = useState<MealItemDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const dataReady = !!(foodDb && settings);

  useEffect(() => {
    if (!setupStatus.loading && !setupStatus.isReady) {
      router.replace("/");
    }
  }, [setupStatus, router]);

  useEffect(() => {
    loadFoodDb().then(setFoodDb);
    getSettings().then(setSettings);
    refreshRecentMeals();
  }, []);

  async function refreshRecentMeals() {
    const meals = await db.mealLogs.orderBy("loggedAt").reverse().limit(10).toArray();
    setRecentMeals(meals);
  }

  async function handlePhotoCapture(blob: Blob) {
    setStep("analyzing");
    setError(null);
    if (!settings || !foodDb) {
      setError("Still loading — try again in a moment.");
      setStep("home");
      return;
    }

    const provider = buildProvider(settings);
    if (!provider) {
      setError("No vision provider is configured. Add an API key (Anthropic or the free Gemini tier) in Settings, or search/scan manually.");
      setStep("home");
      return;
    }

    const hint = settings.plateDiameterCm ? `Plate diameter is approximately ${settings.plateDiameterCm} cm — use it as a scale reference.` : undefined;

    try {
      const analysis = await provider.analyze(blob, hint);
      setItems(matchAnalysisItems(analysis, foodDb));
      setStep("correcting");
    } catch {
      setError("Couldn't analyze that photo. Log this meal manually instead.");
      setItems([]);
      setStep("search");
    }
  }

  async function handleBarcodeDetected(barcode: string) {
    setStep("analyzing");
    setError(null);
    try {
      const product = await lookupBarcode(barcode);
      if (!product) {
        setError(`No product found for barcode ${barcode}. Search for it manually instead.`);
        setStep("search");
        return;
      }
      setItems([
        {
          localId: makeLocalId(),
          name: product.brand ? `${product.name} (${product.brand})` : product.name,
          grams: 100,
          confidence: 1,
          nutrientsPer100g: product.nutrients,
          source: "openfoodfacts",
        },
      ]);
      setStep("correcting");
    } catch {
      setError("Couldn't reach Open Food Facts. Search for the item manually instead.");
      setStep("search");
    }
  }

  function handleManualFoodSelected(food: { name: string; nutrients: Record<string, number | null> }) {
    setItems((prev) => [
      ...prev,
      {
        localId: makeLocalId(),
        name: food.name,
        grams: 100,
        confidence: 1,
        nutrientsPer100g: food.nutrients,
        source: "manual",
      },
    ]);
    setStep("correcting");
  }

  async function handleSaveMeal() {
    setSaving(true);
    try {
      await db.mealLogs.add({
        loggedAt: new Date().toISOString(),
        items: items.map(({ name, grams, confidence, nutrientsPer100g, source }) => ({
          name,
          grams,
          confidence,
          nutrientsPer100g,
          source,
        })),
      });
      await refreshRecentMeals();
      setStatusMessage("Meal logged.");
      setItems([]);
      setStep("home");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogAgain(meal: LoggedMeal) {
    await db.mealLogs.add({ loggedAt: new Date().toISOString(), items: meal.items });
    await refreshRecentMeals();
    setStatusMessage("Meal logged again.");
  }

  async function handleDeleteMeal(meal: LoggedMeal) {
    if (meal.id == null) return;
    if (!confirm("Remove this meal from your log?")) return;
    await db.mealLogs.delete(meal.id);
    await refreshRecentMeals();
    setStatusMessage("Meal removed.");
  }

  function resetToHome() {
    setItems([]);
    setError(null);
    setStep("home");
  }

  if (setupStatus.loading || !setupStatus.isReady) {
    return <main className="mx-auto max-w-lg p-6 text-sm text-toast">Loading…</main>;
  }

  return (
    <main className="mx-auto max-w-lg space-y-6 p-6">
      <h1 className="font-display text-3xl">Log a meal</h1>

      {statusMessage && step === "home" && <p className="text-sm text-cocoa">{statusMessage}</p>}
      {error && <p className="text-sm text-cocoa">{error}</p>}

      {step === "home" && (
        <div className="space-y-6">
          {!dataReady && <p className="text-sm text-toast">Loading food database…</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Button
              type="button"
              variant="primary"
              disabled={!dataReady}
              onClick={() => {
                setStatusMessage(null);
                setStep("camera");
              }}
            >
              Photo
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!dataReady}
              onClick={() => {
                setStatusMessage(null);
                setStep("barcode");
              }}
            >
              Scan barcode
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!dataReady}
              onClick={() => {
                setStatusMessage(null);
                setStep("search");
              }}
            >
              Search manually
            </Button>
          </div>

          {recentMeals.length > 0 && (
            <div>
              <h2 className="text-sm font-bold">Ate this again?</h2>
              <ul className="mt-2 divide-y divide-toast/15 border-l-4 border-avocado">
                {recentMeals.map((meal) => (
                  <li key={meal.id} className="flex items-center justify-between gap-2 py-2 pl-3">
                    <div>
                      <p className="text-base text-cocoa">{meal.items.map((i) => i.name).join(", ")}</p>
                      <p className="text-xs text-toast">{new Date(meal.loggedAt).toLocaleString()}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <Button type="button" variant="outline" onClick={() => handleLogAgain(meal)} className="text-xs">
                        Log again
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => handleDeleteMeal(meal)}
                        className="text-xs text-poppy"
                        aria-label={`Remove ${meal.items.map((i) => i.name).join(", ")} from log`}
                      >
                        Delete
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {step === "camera" && <CameraCapture onCapture={handlePhotoCapture} onCancel={resetToHome} />}

      {step === "barcode" && <BarcodeScanner onDetected={handleBarcodeDetected} onCancel={resetToHome} />}

      {step === "search" && foodDb && (
        <div className="space-y-3">
          <FoodSearch foodDb={foodDb} onSelect={handleManualFoodSelected} autoFocus />
          <Button type="button" variant="ghost" onClick={resetToHome}>
            Back
          </Button>
        </div>
      )}

      {step === "analyzing" && <p className="text-sm text-toast">Analyzing…</p>}

      {step === "correcting" && foodDb && (
        <MealCorrectionScreen
          items={items}
          foodDb={foodDb}
          onItemsChange={setItems}
          onSave={handleSaveMeal}
          onCancel={resetToHome}
          saving={saving}
        />
      )}
    </main>
  );
}
