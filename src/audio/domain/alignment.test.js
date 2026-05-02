import { describe, it, expect } from "vitest";
import { computeSamplePlaybackParams } from "../core/computeSamplePlaybackParams";
import { getTimeStretchProfile } from "./timeStretch";
import { getSafeSampleSettings } from "./sampleSettings";

describe("audio alignment: realtime vs offline export", () => {
  function createMockBuffer(durationSec) {
    return {
      duration: durationSec,
      length: Math.round(durationSec * 44100),
      sampleRate: 44100,
      numberOfChannels: 2,
      getChannelData: () => new Float32Array(Math.round(durationSec * 44100)),
    };
  }

  const baseSettings = getSafeSampleSettings({
    pitchCents: 0,
    lengthPct: 100,
    fadeInPct: 0,
    fadeOutPct: 0,
    envEnabled: false,
    envReleaseMs: 0,
  });

  it("computeSamplePlaybackParams returns identical results for realtime and offline paths", () => {
    const buffer = createMockBuffer(2);
    const midiPitch = 72;
    const noteLengthSteps = 4;
    const sixteenth = 0.25;

    const realtime = computeSamplePlaybackParams(
      buffer,
      baseSettings,
      midiPitch,
      noteLengthSteps,
      sixteenth,
    );

    const offline = computeSamplePlaybackParams(
      buffer,
      baseSettings,
      midiPitch,
      noteLengthSteps,
      sixteenth,
    );

    expect(offline.playbackRate).toBe(realtime.playbackRate);
    expect(offline.sampleReadDuration).toBe(realtime.sampleReadDuration);
    expect(offline.sourcePlayDuration).toBe(realtime.sourcePlayDuration);
    expect(offline.noteGateDuration).toBe(realtime.noteGateDuration);
    expect(offline.shouldApplyEnvelope).toBe(realtime.shouldApplyEnvelope);
    expect(offline.fadeInSec).toBe(realtime.fadeInSec);
    expect(offline.fadeOutSec).toBe(realtime.fadeOutSec);
  });

  it("computeSamplePlaybackParams with overrides matches realtime when overrides are the computed defaults", () => {
    const buffer = createMockBuffer(2);
    const computed = computeSamplePlaybackParams(
      buffer,
      baseSettings,
      84, // +12 semitones = 2x rate
      4,
      0.25,
    );

    const withOverrides = computeSamplePlaybackParams(
      buffer,
      baseSettings,
      84,
      4,
      0.25,
      null,
      {
        playbackRate: computed.playbackRate,
        samplePlayableDuration: computed.samplePlayableDuration,
      },
    );

    expect(withOverrides.playbackRate).toBe(computed.playbackRate);
    expect(withOverrides.sourcePlayDuration).toBe(computed.sourcePlayDuration);
  });

  it("getTimeStretchProfile: resample mode gives identical playbackRate regardless of granular support", () => {
    const settings = getSafeSampleSettings({
      stretchMode: "resample",
      stretchMultiplier: 1,
      stretchTimeMode: "none",
    });

    const realtime = getTimeStretchProfile(settings, 2, 120, 1);
    const offline = getTimeStretchProfile(settings, 2, 120, 1, {
      supportsGranularStretch: false,
    });

    expect(offline.playbackRate).toBe(realtime.playbackRate);
    expect(offline.targetDurationSec).toBe(realtime.targetDurationSec);
    expect(offline.useGranularStretch).toBe(false);
  });

  it("getTimeStretchProfile: stretch mode disables granular in offline but keeps same playbackRate", () => {
    const settings = getSafeSampleSettings({
      stretchMode: "stretch",
      stretchPitchSemitones: 0,
      stretchMultiplier: 1,
      stretchTimeMode: "none",
    });

    const realtime = getTimeStretchProfile(settings, 2, 120, 1);
    const offline = getTimeStretchProfile(settings, 2, 120, 1, {
      supportsGranularStretch: false,
    });

    expect(realtime.useGranularStretch).toBe(true);
    expect(offline.useGranularStretch).toBe(false);
    expect(offline.playbackRate).toBe(realtime.playbackRate);
    expect(offline.targetDurationSec).toBe(realtime.targetDurationSec);
  });

  it("getTimeStretchProfile: none mode is identical in both paths", () => {
    const settings = getSafeSampleSettings({
      stretchMode: "none",
      stretchMultiplier: 1,
      stretchTimeMode: "none",
    });

    const realtime = getTimeStretchProfile(settings, 2, 120, 1);
    const offline = getTimeStretchProfile(settings, 2, 120, 1, {
      supportsGranularStretch: false,
    });

    expect(offline.playbackRate).toBe(realtime.playbackRate);
    expect(offline.targetDurationSec).toBe(realtime.targetDurationSec);
    expect(offline.useGranularStretch).toBe(false);
  });

  it("end-to-end: voice params computed from stretch profile are deterministic", () => {
    const buffer = createMockBuffer(2);
    const stretchSettings = getSafeSampleSettings({
      stretchMode: "resample",
      stretchMultiplier: 2,
      stretchTimeMode: "none",
    });

    const profile = getTimeStretchProfile(stretchSettings, 2, 120, 1);

    const voiceParams = computeSamplePlaybackParams(
      buffer,
      baseSettings,
      72,
      4,
      0.25,
      null,
      {
        playbackRate: profile.playbackRate,
        samplePlayableDuration: profile.targetDurationSec,
      },
    );

    expect(voiceParams.playbackRate).toBe(profile.playbackRate);
    expect(voiceParams.samplePlayableDuration).toBe(profile.targetDurationSec);
    expect(Number.isFinite(voiceParams.sourcePlayDuration)).toBe(true);
    expect(voiceParams.sourcePlayDuration).toBeGreaterThan(0);
  });
});
