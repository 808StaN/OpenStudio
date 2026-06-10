import { describe, it, expect, vi } from "vitest";
import {
  applySampleGainAutomation,
  computeSampleFadeParams,
} from "./sampleGainAutomation";

function createGainParam() {
  return {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
}

describe("computeSampleFadeParams", () => {
  it("computes fade-in and shaped fade-out durations", () => {
    const result = computeSampleFadeParams(2, {
      fadeInPct: 10,
      fadeOutPct: 10,
    });

    expect(result.finalFadeIn).toBeCloseTo(0.2, 5);
    expect(result.finalFadeOut).toBeCloseTo(result.fadeOutSec, 5);
    expect(result.shapedFadeOutPct).toBeGreaterThan(10);
  });

  it("scales fades so they never consume the whole playback window", () => {
    const result = computeSampleFadeParams(1, {
      fadeInPct: 95,
      fadeOutPct: 95,
    });

    expect(result.finalFadeIn + result.finalFadeOut).toBeLessThanOrEqual(0.98);
    expect(result.fadeScale).toBeLessThan(1);
  });
});

describe("applySampleGainAutomation", () => {
  it("ramps from silence when fade-in is enabled", () => {
    const gainParam = createGainParam();

    applySampleGainAutomation(
      gainParam,
      1,
      2,
      0.75,
      { finalFadeIn: 0.25, finalFadeOut: 0 },
    );

    expect(gainParam.setValueAtTime).toHaveBeenCalledWith(0.0001, 1);
    expect(gainParam.linearRampToValueAtTime).toHaveBeenCalledWith(0.75, 1.25);
  });

  it("ramps down to silence when fade-out is enabled", () => {
    const gainParam = createGainParam();

    applySampleGainAutomation(
      gainParam,
      1,
      2,
      0.75,
      { finalFadeIn: 0, finalFadeOut: 0.4 },
    );

    expect(gainParam.setValueAtTime).toHaveBeenCalledWith(0.75, 2.6);
    expect(gainParam.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.0001, 3);
  });

  it("uses retrigger fade-in when it is longer than the configured fade", () => {
    const gainParam = createGainParam();

    applySampleGainAutomation(
      gainParam,
      1,
      2,
      0.75,
      { finalFadeIn: 0.05, finalFadeOut: 0 },
      { retriggerFadeInSec: 0.2 },
    );

    expect(gainParam.linearRampToValueAtTime).toHaveBeenCalledWith(0.75, 1.2);
  });
});
