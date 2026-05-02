import { describe, it, expect } from "vitest";
import {
  getStretchTargetDurationSeconds,
  getTimeStretchProfile,
} from "./timeStretch";
import { MIN_DURATION_SEC } from "./constants";

describe("getStretchTargetDurationSeconds", () => {
  const baseSettings = { stretchMultiplier: 1, stretchTimeMode: "none" };

  it("returns clamped sample duration for 'none' time mode", () => {
    const result = getStretchTargetDurationSeconds(baseSettings, 2, 120);
    expect(result).toBeCloseTo(2, 5);
  });

  it("applies stretch multiplier in 'none' mode", () => {
    const result = getStretchTargetDurationSeconds(
      { ...baseSettings, stretchMultiplier: 2 },
      2,
      120
    );
    expect(result).toBeCloseTo(4, 5);
  });

  it("clamps multiplier to [0.25, 8]", () => {
    const low = getStretchTargetDurationSeconds(
      { ...baseSettings, stretchMultiplier: 0.1 },
      2,
      120
    );
    const high = getStretchTargetDurationSeconds(
      { ...baseSettings, stretchMultiplier: 10 },
      2,
      120
    );
    expect(low).toBeCloseTo(0.5, 5);
    expect(high).toBeCloseTo(16, 5);
  });

  it("calculates 'set-bpm' duration from source vs current BPM", () => {
    const result = getStretchTargetDurationSeconds(
      { stretchTimeMode: "set-bpm", stretchSourceBpm: 120, stretchMultiplier: 1 },
      2,
      60
    );
    // 2 * (120/60) = 4
    expect(result).toBeCloseTo(4, 5);
  });

  it("calculates 'project-tempo' duration from locked BPM", () => {
    const result = getStretchTargetDurationSeconds(
      { stretchTimeMode: "project-tempo", stretchProjectTempoBpm: 60, stretchMultiplier: 1 },
      2,
      120
    );
    // 2 * (60/120) = 1
    expect(result).toBeCloseTo(1, 5);
  });

  it("returns quarter note for 'beat-1'", () => {
    const result = getStretchTargetDurationSeconds(
      { stretchTimeMode: "beat-1", stretchMultiplier: 1 },
      10,
      120
    );
    // 60/120 = 0.5s
    expect(result).toBeCloseTo(0.5, 5);
  });

  it("returns two quarters for 'beat-2'", () => {
    const result = getStretchTargetDurationSeconds(
      { stretchTimeMode: "beat-2", stretchMultiplier: 1 },
      10,
      120
    );
    expect(result).toBeCloseTo(1.0, 5);
  });

  it("returns one bar for 'bar-1'", () => {
    const result = getStretchTargetDurationSeconds(
      { stretchTimeMode: "bar-1", stretchMultiplier: 1 },
      10,
      120
    );
    // 4 * 0.5 = 2s
    expect(result).toBeCloseTo(2.0, 5);
  });

  it("returns four bars for 'bar-4'", () => {
    const result = getStretchTargetDurationSeconds(
      { stretchTimeMode: "bar-4", stretchMultiplier: 1 },
      10,
      120
    );
    // 16 * 0.5 = 8s
    expect(result).toBeCloseTo(8.0, 5);
  });

  it("enforces minimum duration", () => {
    const result = getStretchTargetDurationSeconds(
      { stretchTimeMode: "beat-1", stretchMultiplier: 0.25 },
      0.001,
      120
    );
    expect(result).toBeGreaterThanOrEqual(MIN_DURATION_SEC);
  });

  it("falls back to 'none' for unknown time mode", () => {
    const result = getStretchTargetDurationSeconds(
      { stretchTimeMode: "unknown", stretchMultiplier: 1 },
      2,
      120
    );
    expect(result).toBeCloseTo(2, 5);
  });

  it("handles empty settings gracefully", () => {
    const result = getStretchTargetDurationSeconds({}, 2, 120);
    expect(result).toBeCloseTo(2, 5);
  });
});

describe("getTimeStretchProfile", () => {
  const baseSettings = { stretchMode: "none", stretchPitchSemitones: 0 };

  it("returns base rate and natural duration when stretchMode is 'none'", () => {
    const result = getTimeStretchProfile(baseSettings, 2, 120, 1);
    expect(result.playbackRate).toBe(1);
    expect(result.useGranularStretch).toBe(false);
    expect(result.targetDurationSec).toBeCloseTo(2, 5);
  });

  it("applies pitch shift in 'stretch' mode with granular flag", () => {
    const result = getTimeStretchProfile(
      { stretchMode: "stretch", stretchPitchSemitones: 12, stretchMultiplier: 1, stretchTimeMode: "none" },
      2,
      120,
      1
    );
    expect(result.playbackRate).toBeCloseTo(2, 3);
    expect(result.useGranularStretch).toBe(true);
  });

  it("disables granular stretch when supportsGranularStretch is false", () => {
    const result = getTimeStretchProfile(
      { stretchMode: "stretch", stretchPitchSemitones: 0, stretchMultiplier: 1, stretchTimeMode: "none" },
      2,
      120,
      1,
      { supportsGranularStretch: false }
    );
    expect(result.useGranularStretch).toBe(false);
  });

  it("computes duration rate in 'resample' mode", () => {
    const result = getTimeStretchProfile(
      { stretchMode: "resample", stretchPitchSemitones: 0, stretchMultiplier: 2, stretchTimeMode: "none" },
      2,
      120,
      1
    );
    // targetDuration = 2 * 2 = 4, durationRate = 2/4 = 0.5
    expect(result.playbackRate).toBeCloseTo(0.5, 5);
    expect(result.useGranularStretch).toBe(false);
  });

  it("combines pitch shift and duration rate in 'resample' mode", () => {
    const result = getTimeStretchProfile(
      { stretchMode: "resample", stretchPitchSemitones: 12, stretchMultiplier: 1, stretchTimeMode: "none" },
      2,
      120,
      1
    );
    // pitchShiftRate = 2, durationRate = 1, playbackRate = 2
    expect(result.playbackRate).toBeCloseTo(2, 3);
  });

  it("clamps playback rate to [MIN_PLAYBACK_RATE, MAX_PLAYBACK_RATE]", () => {
    const high = getTimeStretchProfile(
      { stretchMode: "resample", stretchPitchSemitones: 24, stretchMultiplier: 1, stretchTimeMode: "none" },
      2,
      120,
      8
    );
    expect(high.playbackRate).toBeLessThanOrEqual(8);

    const low = getTimeStretchProfile(
      { stretchMode: "resample", stretchPitchSemitones: -24, stretchMultiplier: 1, stretchTimeMode: "none" },
      2,
      120,
      0.125
    );
    expect(low.playbackRate).toBeGreaterThanOrEqual(0.125);
  });

  it("coerces invalid stretchMode to 'none'", () => {
    const result = getTimeStretchProfile(
      { stretchMode: "invalid", stretchPitchSemitones: 0 },
      2,
      120,
      1
    );
    expect(result.playbackRate).toBe(1);
    expect(result.useGranularStretch).toBe(false);
  });

  it("clamps pitch shift to [-24, 24] semitones", () => {
    const high = getTimeStretchProfile(
      { stretchMode: "stretch", stretchPitchSemitones: 36, stretchMultiplier: 1, stretchTimeMode: "none" },
      2,
      120,
      1
    );
    const low = getTimeStretchProfile(
      { stretchMode: "stretch", stretchPitchSemitones: -36, stretchMultiplier: 1, stretchTimeMode: "none" },
      2,
      120,
      1
    );
    expect(high.playbackRate).toBeCloseTo(4, 3);
    expect(low.playbackRate).toBeCloseTo(0.25, 3);
  });
});
