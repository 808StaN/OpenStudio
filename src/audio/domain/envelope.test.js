import { describe, it, expect, vi } from "vitest";
import { applyVolumeEnvelopeToGain } from "./envelope";

describe("envelope", () => {
  function makeMockGainParam() {
    return {
      cancelScheduledValues: vi.fn(),
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
    };
  }

  it("sets initial value to min gain", () => {
    const gainParam = makeMockGainParam();
    applyVolumeEnvelopeToGain(gainParam, 0, 1, {});
    expect(gainParam.cancelScheduledValues).toHaveBeenCalledWith(0);
    expect(gainParam.setValueAtTime).toHaveBeenCalledWith(0.0001, 0);
  });

  it("applies delay before attack", () => {
    const gainParam = makeMockGainParam();
    applyVolumeEnvelopeToGain(gainParam, 0, 1, { envDelayMs: 100, envAttackMs: 50 });
    const calls = gainParam.setValueAtTime.mock.calls;
    expect(calls.some((call) => call[1] === 0.1)).toBe(true);
  });

  it("ramps to 1 during attack", () => {
    const gainParam = makeMockGainParam();
    applyVolumeEnvelopeToGain(gainParam, 0, 1, { envAttackMs: 100 });
    expect(gainParam.linearRampToValueAtTime).toHaveBeenCalledWith(1, 0.1);
  });

  it("holds at 1 during hold phase", () => {
    const gainParam = makeMockGainParam();
    applyVolumeEnvelopeToGain(gainParam, 0, 1, { envHoldMs: 50 });
    const holdCall = gainParam.setValueAtTime.mock.calls.find((call) => call[0] === 1);
    expect(holdCall).toBeDefined();
  });

  it("ramps to sustain during decay", () => {
    const gainParam = makeMockGainParam();
    applyVolumeEnvelopeToGain(gainParam, 0, 1, { envDecayMs: 100, envSustainPct: 50 });
    expect(gainParam.linearRampToValueAtTime).toHaveBeenCalledWith(0.5, expect.any(Number));
  });

  it("releases to min gain after gate", () => {
    const gainParam = makeMockGainParam();
    applyVolumeEnvelopeToGain(gainParam, 0, 0.5, { envReleaseMs: 100 });
    expect(gainParam.linearRampToValueAtTime).toHaveBeenCalledWith(0.0001, 0.6);
  });

  it("uses setValueAtTime for instant release", () => {
    const gainParam = makeMockGainParam();
    applyVolumeEnvelopeToGain(gainParam, 0, 0.5, { envReleaseMs: 0 });
    expect(gainParam.setValueAtTime).toHaveBeenCalledWith(0.0001, 0.5);
  });
});
