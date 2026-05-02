import { describe, it, expect } from "vitest";
import {
  getSafeSampleSettings,
  DEFAULT_SAMPLE_SETTINGS,
} from "./sampleSettings";

describe("getSafeSampleSettings", () => {
  it("returns defaults when given null", () => {
    const result = getSafeSampleSettings(null);
    expect(result.stretchMode).toBe("resample");
    expect(result.pitchCents).toBe(0);
    expect(result.normalize).toBe(false);
    expect(result.lengthPct).toBe(100);
  });

  it("returns defaults when given undefined", () => {
    const result = getSafeSampleSettings(undefined);
    expect(result.stretchMode).toBe("resample");
    expect(result.pitchCents).toBe(0);
  });

  it("migrates pitchSemitones to pitchCents when pitchCents is absent", () => {
    const result = getSafeSampleSettings({ pitchSemitones: 0.5 });
    expect(result.pitchCents).toBe(50);
    expect(result.pitchSemitones).toBeUndefined();
  });

  it("clamps migrated pitchCents to the allowed range", () => {
    const result = getSafeSampleSettings({ pitchSemitones: 12 });
    expect(result.pitchCents).toBe(100);
  });

  it("preserves pitchCents when both fields are present", () => {
    const result = getSafeSampleSettings({ pitchCents: 50, pitchSemitones: 12 });
    expect(result.pitchCents).toBe(50);
  });

  it("uses zero pitchCents when both fields are absent", () => {
    const result = getSafeSampleSettings({});
    expect(result.pitchCents).toBe(0);
  });

  it("clamps lengthPct between 5 and 100", () => {
    expect(getSafeSampleSettings({ lengthPct: 3 }).lengthPct).toBe(5);
    expect(getSafeSampleSettings({ lengthPct: 120 }).lengthPct).toBe(100);
    expect(getSafeSampleSettings({ lengthPct: 50 }).lengthPct).toBe(50);
  });

  it("clamps fade percentages between 0 and 95 and keeps combined fade under 98", () => {
    const result = getSafeSampleSettings({ fadeInPct: 60, fadeOutPct: 60 });
    const total = result.fadeInPct + result.fadeOutPct;
    expect(total).toBeLessThanOrEqual(98);
    expect(result.fadeInPct).toBeGreaterThanOrEqual(0);
    expect(result.fadeOutPct).toBeGreaterThanOrEqual(0);
  });

  it("coerces invalid stretchMode to 'none'", () => {
    expect(getSafeSampleSettings({ stretchMode: "invalid" }).stretchMode).toBe(
      "none"
    );
    expect(getSafeSampleSettings({ stretchMode: "stretch" }).stretchMode).toBe(
      "stretch"
    );
  });

  it("coerces invalid stretchTimeMode to 'none'", () => {
    expect(
      getSafeSampleSettings({ stretchTimeMode: "bad-mode" }).stretchTimeMode
    ).toBe("none");
    expect(
      getSafeSampleSettings({ stretchTimeMode: "project-tempo" }).stretchTimeMode
    ).toBe("project-tempo");
  });

  it("clamps envelope parameters", () => {
    const result = getSafeSampleSettings({
      envDelayMs: 5000,
      envAttackMs: -100,
      envSustainPct: 150,
    });
    expect(result.envDelayMs).toBe(3000);
    expect(result.envAttackMs).toBe(0);
    expect(result.envSustainPct).toBe(100);
  });

  it("does not mutate the input object", () => {
    const input = { pitchSemitones: 5, lengthPct: 80 };
    getSafeSampleSettings(input);
    expect(input.pitchSemitones).toBe(5);
    expect(input.lengthPct).toBe(80);
  });
});
