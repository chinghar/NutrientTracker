import { blobToBase64, resizeAndCompressImage } from "./image";
import { buildMealAnalysisPrompt } from "./prompt";
import { parseMealAnalysis, VisionAnalysisError, type MealAnalysis, type VisionProvider } from "./types";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
/**
 * Flash tier: fast, multimodal, and covered by Google AI Studio's free tier.
 * Deliberately not the newest-tier model (3.7/3.8) — those can return
 * "caller does not have permission" for keys/projects that haven't been
 * granted access to the bleeding-edge tier yet. 3.5 is Google's own
 * recommended migration target off the older 2.x models and is broadly
 * available.
 */
const DEFAULT_MODEL = "gemini-3.5-flash";

interface GeminiPart {
  text?: string;
}
interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] } }[];
}
interface GeminiErrorResponse {
  error?: { message?: string };
}

/**
 * Calls the Gemini API directly from the browser — no proxy, no server.
 * Google's generateContent endpoint sends CORS headers that allow a direct
 * browser-origin request (verified against the live API), the same way
 * Anthropic's does with its direct-browser-access header.
 */
export class GeminiBrowserProvider implements VisionProvider {
  readonly id = "gemini";
  readonly label = "Gemini (free API key)";

  constructor(
    private readonly apiKey: string,
    private readonly model: string = DEFAULT_MODEL,
  ) {}

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
      "Gemini didn't return a valid meal analysis after two attempts. Falling back to manual entry.",
      lastError,
    );
  }

  /** Makes one minimal, free request purely to validate the key. */
  async testKey(): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      await this.callGenerateContent({
        contents: [{ parts: [{ text: "Reply with the single word: ok" }] }],
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async requestText(base64Image: string, promptText: string): Promise<string> {
    const response = await this.callGenerateContent({
      contents: [
        {
          parts: [{ text: promptText }, { inline_data: { mime_type: "image/jpeg", data: base64Image } }],
        },
      ],
      generationConfig: { response_mime_type: "application/json" },
    });

    const text = response.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text;
    if (!text) throw new VisionAnalysisError("Gemini's response contained no text content.");
    return text;
  }

  private async callGenerateContent(body: Record<string, unknown>): Promise<GeminiResponse> {
    const url = `${GEMINI_BASE_URL}/${this.model}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let message = `Gemini API request failed with status ${res.status}.`;
      try {
        const errBody = (await res.json()) as GeminiErrorResponse;
        if (errBody.error?.message) message = errBody.error.message;
      } catch {
        // response body wasn't JSON; keep the generic message
      }
      throw new VisionAnalysisError(message);
    }

    return (await res.json()) as GeminiResponse;
  }
}
