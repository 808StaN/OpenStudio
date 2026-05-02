import { describe, it, expect } from "vitest";
import { computeSamplePlaybackParams } from "./computeSamplePlaybackParams";
import { MIN_DURATION_SEC } from "../domain/constants";

function createMockBuffer(durationSec) {
  return {
    duration: durationSec,
    length: Math.round(durationSec * 44100),
    sampleRate: 44100,
    numberOfChannels: 2,
    getChannelData: () => new Float32Array(Math.round(durationSec * 44100)),
  };
}

describe("computeSamplePlaybackParams", () => {
  const baseSettings = {
    pitchCents: 0,
    lengthPct: 100,
    fadeInPct: 0,
    fadeOutPct: 0,
    envEnabled: false,
    envReleaseMs: 0,
  };

  it("computes basic playback rate for default MIDI pitch", () => {
    const buffer = createMockBuffer(2);
    const result = computeSamplePlaybackParams(buffer, baseSettings, 72, 4, 0.25);
    expect(result.playbackRate).toBe(1);
    expect(result.sampleReadDuration).toBeCloseTo(2, 5);
    expect(result.noteGateDuration).toBeCloseTo(1, 5); // 4 * 0.25
  });

  it("shifts playback rate by MIDI pitch", () => {
    const buffer = createMockBuffer(2);
    const result = computeSamplePlaybackParams(buffer, baseSettings, 84, 4, 0.25);
    // 84 is +12 semitones = 2x rate
    expect(result.playbackRate).toBeCloseTo(2, 3);
  });

  it("applies pitchCents offset", () => {
    const buffer = createMockBuffer(2);
    const result = computeSamplePlaybackParams(
      buffer,
      { ...baseSettings, pitchCents: 1200 },
      72,
      4,
      0.25
    );
    expect(result.playbackRate).toBeCloseTo(2, 3);
  });

  it("uses override playbackRate when provided", () => {
    const buffer = createMockBuffer(2);
    const result = computeSamplePlaybackParams(
      buffer,
      baseSettings,
      72,
      4,
      0.25,
      null,
      { playbackRate: 0.5 }
    );
    expect(result.playbackRate).toBe(0.5);
  });

  it("scales sampleReadDuration by lengthPct", () => {
    const buffer = createMockBuffer(4);
    const result = computeSamplePlaybackParams(
      buffer,
      { ...baseSettings, lengthPct: 50 },
      72,
      4,
      0.25
    );
    expect(result.sampleReadDuration).toBeCloseTo(2, 5);
  });

  it("computes natural playable duration from read duration and rate", () => {
    const buffer = createMockBuffer(4);
    const result = computeSamplePlaybackParams(
      buffer,
      baseSettings,
      84, // 2x rate
      4,
      0.25
    );
    // 4 / 2 = 2
    expect(result.naturalPlayableDuration).toBeCloseTo(2, 5);
  });

  it("uses override samplePlayableDuration when provided", () => {
    const buffer = createMockBuffer(2);
    const result = computeSamplePlaybackParams(
      buffer,
      baseSettings,
      72,
      4,
      0.25,
      null,
      { samplePlayableDuration: 0.5 }
    );
    expect(result.samplePlayableDuration).toBe(0.5);
  });

  it("applies envelope and limits source play duration by gate + release", () => {
    const buffer = createMockBuffer(10);
    const result = computeSamplePlaybackParams(
      buffer,
      { ...baseSettings, envEnabled: true, envReleaseMs: 500 },
      72,
      4, // 4 steps
      0.25 // 1 sec gate
    );
    expect(result.shouldApplyEnvelope).toBe(true);
    expect(result.envReleaseSec).toBe(0.5);
    // sourcePlayDuration = min(10, 1 + 0.5) = 1.5
    expect(result.sourcePlayDuration).toBeCloseTo(1.5, 5);
  });

  it("does not apply envelope when disabled", () => {
    const buffer = createMockBuffer(2);
    const result = computeSamplePlaybackParams(buffer, baseSettings, 72, 4, 0.25);
    expect(result.shouldApplyEnvelope).toBe(false);
    expect(result.envReleaseSec).toBe(0);
    expect(result.sourcePlayDuration).toBeCloseTo(2, 5);
  });

  it("scales fade in/out to fit within source play duration", () => {
    const buffer = createMockBuffer(1);
    const result = computeSamplePlaybackParams(
      buffer,
      { ...baseSettings, fadeInPct: 60, fadeOutPct: 60 },
      72,
      4,
      0.25
    );
    // fadeTotal would be 1.2s > 0.98s, so it gets scaled
    const totalFade = result.finalFadeIn + result.finalFadeOut;
    expect(totalFade).toBeLessThanOrEqual(result.sourcePlayDuration * 0.98 + 0.0001);
  });

  it("keeps fades unscaled when they fit", () => {
    const buffer = createMockBuffer(2);
    const result = computeSamplePlaybackParams(
      buffer,
      { ...baseSettings, fadeInPct: 10, fadeOutPct: 10 },
      72,
      4,
      0.25
    );
    expect(result.fadeScale).toBe(1);
    expect(result.finalFadeIn).toBeCloseTo(0.2, 5);
    expect(result.finalFadeOut).toBeCloseTo(result.fadeOutSec, 5);
  });

  it("enforces minimum duration when note length is zero", () => {
    const buffer = createMockBuffer(2);
    const result = computeSamplePlaybackParams(buffer, baseSettings, 72, 0, 0.25);
    expect(result.noteGateDuration).toBeGreaterThanOrEqual(MIN_DURATION_SEC);
  });

  it("falls back to default MIDI pitch when given null/undefined", () => {
    const buffer = createMockBuffer(2);
    const resultNull = computeSamplePlaybackParams(buffer, baseSettings, null, 4, 0.25);
    const resultUndef = computeSamplePlaybackParams(buffer, baseSettings, undefined, 4, 0.25);
    expect(resultNull.playbackRate).toBe(1);
    expect(resultUndef.playbackRate).toBe(1);
  });

  it("clamps playback rate to allowed bounds", () => {
    const buffer = createMockBuffer(2);
    const extremeCents = { ...baseSettings, pitchCents: 24000 };
    const result = computeSamplePlaybackParams(buffer, extremeCents, 120, 4, 0.25);
    expect(result.playbackRate).toBeLessThanOrEqual(8);
    expect(result.playbackRate).toBeGreaterThanOrEqual(0.125);
  });

  it("returns envelope gate duration capped by source play duration", () => {
    const buffer = createMockBuffer(10);
    const result = computeSamplePlaybackParams(
      buffer,
      { ...baseSettings, envEnabled: true, envReleaseMs: 100 },
      72,
      2, // 0.5s gate
      0.25
    );
    expect(result.envelopeGateDuration).toBeCloseTo(0.5, 5);
    expect(result.envelopeGateDuration).toBeLessThanOrEqual(result.sourcePlayDuration);
  });
});
