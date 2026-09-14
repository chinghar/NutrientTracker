import { z } from "zod";

/**
 * One food item identified in a meal photo. Deliberately carries no nutrient
 * values — those are looked up from the local USDA dataset (Phase 1) by
 * joining on `foodQuery` against the food name index, then scaled by
 * `estimatedGrams`. The vision model only ever outputs identity and mass.
 */
export const mealAnalysisItemSchema = z.object({
  name: z.string().min(1),
  /** Search string to look up against the local MiniSearch food index. */
  foodQuery: z.string().min(1),
  estimatedGrams: z.number().positive(),
  /** 0 (pure guess) to 1 (certain). */
  confidence: z.number().min(0).max(1),
  /** Short human-readable explanation of how the estimate was made. */
  reasoning: z.string(),
});

export const mealAnalysisSchema = z.object({
  items: z.array(mealAnalysisItemSchema).min(1),
});

export type MealAnalysisItem = z.infer<typeof mealAnalysisItemSchema>;
export type MealAnalysis = z.infer<typeof mealAnalysisSchema>;

/**
 * Thrown when a vision provider cannot produce a valid MealAnalysis (bad
 * key, network failure, or a model response that fails schema validation
 * even after one retry). Callers should catch this and fall back to manual
 * entry rather than guessing at partial/invalid data.
 */
export class VisionAnalysisError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "VisionAnalysisError";
  }
}

export interface VisionProvider {
  readonly id: string;
  readonly label: string;
  analyze(imageBlob: Blob, hint?: string): Promise<MealAnalysis>;
}

/**
 * Strips common wrapping (markdown code fences, leading/trailing prose) a
 * model sometimes adds even when asked for raw JSON, then parses and
 * validates against mealAnalysisSchema.
 */
export function parseMealAnalysis(rawText: string): MealAnalysis {
  const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : rawText).trim();

  let json: unknown;
  try {
    json = JSON.parse(candidate);
  } catch (err) {
    throw new VisionAnalysisError("Model response was not valid JSON.", err);
  }

  const result = mealAnalysisSchema.safeParse(json);
  if (!result.success) {
    throw new VisionAnalysisError("Model response did not match the expected schema.", result.error);
  }
  return result.data;
}
