import { blobToBase64, resizeAndCompressImage } from "./image";
import { buildMealAnalysisPrompt } from "./prompt";
import { parseMealAnalysis, VisionAnalysisError, type MealAnalysis, type VisionProvider } from "./types";

const OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_MODEL = "llava";

/**
 * Ollama only runs on the developer's own machine — a deployed Vercel build
 * is served from a different origin and could never reach localhost. This
 * is an environment check, not an availability probe, so Settings can hide
 * the option in production rather than offering it and failing confusingly.
 */
export function isOllamaAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

interface OllamaGenerateResponse {
  response: string;
}

/** Free local-development vision provider, pointed at a locally running Ollama instance. */
export class OllamaProvider implements VisionProvider {
  readonly id = "ollama";
  readonly label = "Ollama (local dev only)";

  constructor(private readonly model: string = DEFAULT_MODEL) {}

  async analyze(imageBlob: Blob, hint?: string): Promise<MealAnalysis> {
    const compressed = await resizeAndCompressImage(imageBlob);
    const base64 = await blobToBase64(compressed);
    const prompt = buildMealAnalysisPrompt(hint);

    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const promptText =
        attempt === 0
          ? prompt
          : `${prompt}\n\nYour previous response could not be parsed as valid JSON matching this schema. Return ONLY the raw JSON object, nothing else.`;

      const text = await this.requestText(base64, promptText);
      try {
        return parseMealAnalysis(text);
      } catch (err) {
        lastError = err;
      }
    }
    throw new VisionAnalysisError(
      "Ollama didn't return a valid meal analysis after two attempts. Falling back to manual entry.",
      lastError,
    );
  }

  private async requestText(base64Image: string, prompt: string): Promise<string> {
    let res: Response;
    try {
      res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          prompt,
          images: [base64Image],
          format: "json",
          stream: false,
        }),
      });
    } catch (err) {
      throw new VisionAnalysisError(
        `Could not reach Ollama at ${OLLAMA_BASE_URL}. Is \`ollama serve\` running with a vision model pulled (e.g. \`ollama pull ${DEFAULT_MODEL}\`)?`,
        err,
      );
    }

    if (!res.ok) {
      throw new VisionAnalysisError(`Ollama request failed with status ${res.status}.`);
    }

    const body = (await res.json()) as OllamaGenerateResponse;
    return body.response;
  }
}
