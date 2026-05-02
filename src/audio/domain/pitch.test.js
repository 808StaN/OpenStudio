import { describe, it, expect } from "vitest";
import {
  midiPitchToPlaybackRate,
  DEFAULT_SAMPLE_MIDI_PITCH,
} from "./pitch";
import { MIN_PLAYBACK_RATE, MAX_PLAYBACK_RATE } from "./constants";

describe("midiPitchToPlaybackRate", () => {
  it("returns 1 for default pitch (72)", () => {
    expect(midiPitchToPlaybackRate(DEFAULT_SAMPLE_MIDI_PITCH)).toBe(1);
  });

  it("returns 1 for null/undefined", () => {
    expect(midiPitchToPlaybackRate(null)).toBe(1);
    expect(midiPitchToPlaybackRate(undefined)).toBe(1);
  });

  it("doubles rate for +12 semitones", () => {
    expect(midiPitchToPlaybackRate(84)).toBeCloseTo(2, 5);
  });

  it("halves rate for -12 semitones", () => {
    expect(midiPitchToPlaybackRate(60)).toBeCloseTo(0.5, 5);
  });

  it("returns 2^(1/12) for +1 semitone", () => {
    expect(midiPitchToPlaybackRate(73)).toBeCloseTo(Math.pow(2, 1 / 12), 5);
  });

  it("clamps to MIN_PLAYBACK_RATE for very low pitches", () => {
    expect(midiPitchToPlaybackRate(-100)).toBe(MIN_PLAYBACK_RATE);
  });

  it("clamps to MAX_PLAYBACK_RATE for very high pitches", () => {
    expect(midiPitchToPlaybackRate(200)).toBe(MAX_PLAYBACK_RATE);
  });
});
