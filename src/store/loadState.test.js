import { describe, it, expect } from "vitest";
import { sanitizeLoadedDawState } from "./loadState";
import { initialState } from "./initialState";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createLegacyLoadedState() {
  const state = clone(initialState);
  state.transport = {
    bpm: 999,
    mode: "invalid",
    isPlaying: true,
    isRecording: true,
    currentStep16: 64,
  };
  state.project.channels[0].sampleSettings = {
    pitchSemitones: 0.5,
    lengthPct: "bad",
    stretchMode: "invalid",
    stretchMultiplier: "bad",
  };
  state.project.patterns[0].lengthSteps = 999;
  state.project.patterns[0].pianoPreview[state.project.channels[0].id] = [
    { start: -5, length: 999, pitch: 300, velocity: 999 },
  ];
  return state;
}

describe("sanitizeLoadedDawState", () => {
  it("returns null for fundamentally invalid payloads", () => {
    expect(sanitizeLoadedDawState(initialState, null)).toBeNull();
    expect(sanitizeLoadedDawState(initialState, { project: {} })).toBeNull();
  });

  it("forces loaded transport into a stopped safe state", () => {
    const result = sanitizeLoadedDawState(initialState, createLegacyLoadedState());

    expect(result.transport.bpm).toBe(300);
    expect(result.transport.mode).toBe("pattern");
    expect(result.transport.isPlaying).toBe(false);
    expect(result.transport.isRecording).toBe(false);
    expect(result.transport.currentStep16).toBe(0);
  });

  it("sanitizes legacy sample settings through the canonical helper", () => {
    const result = sanitizeLoadedDawState(initialState, createLegacyLoadedState());
    const settings = result.project.channels[0].sampleSettings;

    expect(settings.pitchCents).toBe(50);
    expect(settings.pitchSemitones).toBeUndefined();
    expect(settings.lengthPct).toBe(100);
    expect(settings.stretchMode).toBe("none");
    expect(settings.stretchMultiplier).toBe(1);
  });

  it("clamps imported pattern length and piano note fields", () => {
    const result = sanitizeLoadedDawState(initialState, createLegacyLoadedState());
    const pattern = result.project.patterns[0];
    const note = pattern.pianoPreview[result.project.channels[0].id][0];

    expect(pattern.lengthSteps).toBe(128);
    expect(note.start).toBe(0);
    expect(note.length).toBe(128);
    expect(note.pitch).toBe(127);
    expect(note.velocity).toBe(127);
  });
});
