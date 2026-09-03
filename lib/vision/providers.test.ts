import { describe, it, expect } from "vitest";
import { AnthropicBrowserProvider } from "./anthropic-provider";
import { GeminiBrowserProvider } from "./gemini-provider";
import { OllamaProvider } from "./ollama-provider";
import type { VisionProvider } from "./types";

describe("VisionProvider interface conformance", () => {
  it("AnthropicBrowserProvider satisfies VisionProvider", () => {
    const provider: VisionProvider = new AnthropicBrowserProvider("test-key");
    expect(typeof provider.analyze).toBe("function");
    expect(provider.id).toBe("anthropic");
    expect(provider.label).toBeTruthy();
  });

  it("GeminiBrowserProvider satisfies VisionProvider", () => {
    const provider: VisionProvider = new GeminiBrowserProvider("test-key");
    expect(typeof provider.analyze).toBe("function");
    expect(provider.id).toBe("gemini");
    expect(provider.label).toBeTruthy();
  });

  it("OllamaProvider satisfies VisionProvider", () => {
    const provider: VisionProvider = new OllamaProvider();
    expect(typeof provider.analyze).toBe("function");
    expect(provider.id).toBe("ollama");
    expect(provider.label).toBeTruthy();
  });
});
