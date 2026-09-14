import { blobToBase64, resizeAndCompressImage } from "./image";
import { buildMealAnalysisPrompt } from "./prompt";
import { parseMealAnalysis, VisionAnalysisError, type MealAnalysis, type VisionProvider } from "./types";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Free-tier model availability shifts, so this is a list to choose from
 * (surfaced as a dropdown in Settings), not a single hardcoded ID. All four
 * were verified live against the API before listing. 3.5 is the default:
 * it's Google's own recommended migration target off the (now-deprecated)
 * 2.x line and is broadly provisioned, whereas the newest tiers (3.7/3.8)
 * have returned "caller does not have permission" for keys/projects that
 * haven't been granted bleeding-edge access yet.
 */
export const GEMINI_MODELS: { id: string; label: string }[] = [
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash (recommended)" },
  { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
  { id: "gemini-3.7-flash", label: "Gemini 3.7 Flash" },
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash" },
];
export const GEMINI_DEFAULT_MODEL = GEMINI_MODELS[0].id;

interface GeminiPart {
  text?: string;
}
interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] } }[];
}
interface GeminiErrorResponse {
  error?: { message?: string };
}

/** Pure extraction, kept separate from the fetch call below so it's unit-testable without a network call. */
export function extractGeminiText(response: GeminiResponse): string | undefined {
  return response.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text;
}

/**
 * Calls the Gemini API directly from the browser via plain `fetch` — no
 * proxy, no server, and deliberately NOT the `@google/genai` SDK. The SDK's
 * newer Interactions transport attaches an `Api-Revision` header, which
 * triggers a CORS preflight that generativelanguage.googleapis.com rejects
 * (it doesn't list that header in Access-Control-Allow-Headers). The plain
 * generateContent endpoint used here is unaffected and works from the
 * browser — verified live, including that `x-goog-api-key` header auth
 * reaches the same code path as query-param auth.
 */
export class GeminiBrowserProvider implements VisionProvider {
  readonly id = "gemini";
  readonly label = "Gemini (free API key)";

  constructor(
    private readonly apiKey: string,
    private readonly model: string = GEMINI_DEFAULT_MODEL,
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

  /** Makes one minimal, free request purely to validate the key (against this instance's chosen model). */
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

    const text = extractGeminiText(response);
    if (!text) throw new VisionAnalysisError("Gemini's response contained no text content.");
    return text;
  }

  private async callGenerateContent(body: Record<string, unknown>): Promise<GeminiResponse> {
    const url = `${GEMINI_BASE_URL}/${this.model}:generateContent`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": this.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      // Surfaced verbatim (not reworded) so the user can tell, e.g., an
      // overloaded/unavailable model apart from a bad key, and pick
      // another model from the Settings dropdown accordingly.
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
