import { describe, it, expect } from "vitest";
import { computeResizedDimensions } from "./image";

describe("computeResizedDimensions", () => {
  it("leaves an image unchanged when already within the max dimension", () => {
    expect(computeResizedDimensions(800, 600, 1024)).toEqual({ width: 800, height: 600 });
  });

  it("leaves an image unchanged when exactly at the max dimension", () => {
    expect(computeResizedDimensions(1024, 768, 1024)).toEqual({ width: 1024, height: 768 });
  });

  it("scales a landscape image down so the long edge (width) hits the max", () => {
    // 4000x2000 -> long edge 4000 becomes 1024, height scales proportionally to 512
    expect(computeResizedDimensions(4000, 2000, 1024)).toEqual({ width: 1024, height: 512 });
  });

  it("scales a portrait image down so the long edge (height) hits the max", () => {
    // 2000x4000 -> long edge 4000 becomes 1024, width scales proportionally to 512
    expect(computeResizedDimensions(2000, 4000, 1024)).toEqual({ width: 512, height: 1024 });
  });

  it("never produces a zero dimension for an extreme aspect ratio", () => {
    const { width, height } = computeResizedDimensions(10000, 10, 1024);
    expect(width).toBe(1024);
    expect(height).toBeGreaterThanOrEqual(1);
  });
});
