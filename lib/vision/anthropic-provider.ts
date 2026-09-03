import { blobToBase64, resizeAndCompressImage } from "./image";
import { buildMealAnalysisPrompt } from "./prompt";
import { parseMealAnalysis, VisionAnalysisError, type MealAnalysis, type VisionProvider } from "./types";

const MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/** Balances vision quality against per-photo cost for a consumer app users pay for with their own key. */
const DEFAULT_MODEL = "claude-sonnet-5";
/** Cheapest current model, used only for the Settings "Test key" ping. */
const TEST_MODEL = "claude-haiku-4-5";

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

interface AnthropicMessageResponse {
  content: AnthropicContentBlock[];
}

interface AnthropicErrorResponse {
  error?: { type?: string; message?: string };
}

/**
 * Calls the Anthropic Messages API directly from the browser — the photo
 * goes straight from the device to Anthropic and never passes through a
 * Vercel function. `anthropic-dangerous-direct-browser-access` is what
 * makes Anthropic allow a browser-origin CORS request at all.
 */
export class AnthropicBrowserProvider implements VisionProvider {
  readonly id = "anthropic";
  readonly label = "Claude (your API key)";

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
      const text = await this.requestText(base64, prompt, attempt);
      try {
        return parseMealAnalysis(text);
      } catch (err) {
        lastError = err;
      }
    }
    throw new VisionAnalysisError(
      "Claude didn't return a valid meal analysis after two attempts. Falling back to manual entry.",
      lastError,
    );
  }

  /** Makes one minimal, cheap request purely to validate the key. */
  async testKey(): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      await this.callMessages({
        model: TEST_MODEL,
        max_tokens: 8,
        messages: [{ role: "user", content: "Reply with the single word: ok" }],
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async requestText(base64Image: string, prompt: string, attempt: number): Promise<string> {
    const promptText =
      attempt === 0
        ? prompt
        : `${prompt}\n\nYour previous response could not be parsed as valid JSON matching this schema. Return ONLY the raw JSON object, nothing else.`;

    const response = await this.callMessages({
      model: this.model,
      max_tokens: 1024,
      output_config: { effort: "low" },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64Image } },
            { type: "text", text: promptText },
          ],
        },
      ],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock?.text) {
      throw new VisionAnalysisError("Claude's response contained no text content.");
    }
    return textBlock.text;
  }

  private async callMessages(body: Record<string, unknown>): Promise<AnthropicMessageResponse> {
    const res = await fetch(MESSAGES_URL, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let message = `Anthropic API request failed with status ${res.status}.`;
      try {
        const errBody = (await res.json()) as AnthropicErrorResponse;
        if (errBody.error?.message) message = errBody.error.message;
      } catch {
        // response body wasn't JSON; keep the generic message
      }
      throw new VisionAnalysisError(message);
    }

    return (await res.json()) as AnthropicMessageResponse;
  }
}
