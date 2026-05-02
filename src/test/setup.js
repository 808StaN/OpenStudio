import { vi } from "vitest";

// Stub AudioContext for jsdom
global.AudioContext = class AudioContext {
  constructor() {
    this.sampleRate = 44100;
    this.currentTime = 0;
  }
  createBuffer(channels, length, sampleRate) {
    return { duration: length / sampleRate, length, sampleRate, numberOfChannels: channels };
  }
  createGain() {
    return { connect: vi.fn(), gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() } };
  }
  createBufferSource() {
    return { connect: vi.fn(), start: vi.fn(), stop: vi.fn(), playbackRate: { value: 1 } };
  }
  createStereoPanner() {
    return { connect: vi.fn(), pan: { value: 0 } };
  }
  createBiquadFilter() {
    return { connect: vi.fn(), frequency: { value: 1000 }, Q: { value: 1 }, gain: { value: 0 } };
  }
  createDynamicsCompressor() {
    return { connect: vi.fn(), threshold: { value: -24 }, knee: { value: 30 }, ratio: { value: 12 }, attack: { value: 0.003 }, release: { value: 0.25 } };
  }
  createAnalyser() {
    return { connect: vi.fn(), fftSize: 2048, getFloatFrequencyData: vi.fn() };
  }
  decodeAudioData() {
    return Promise.resolve({ duration: 1, length: 44100, sampleRate: 44100, numberOfChannels: 2, getChannelData: () => new Float32Array(44100) });
  }
};

global.OfflineAudioContext = class OfflineAudioContext {
  constructor(channels, length, sampleRate) {
    this.sampleRate = sampleRate || 44100;
    this.length = length || 44100;
    this.numberOfChannels = channels || 2;
    this.currentTime = 0;
  }
  createBufferSource() {
    return { connect: vi.fn(), start: vi.fn(), stop: vi.fn(), playbackRate: { value: 1 } };
  }
  createGain() {
    return { connect: vi.fn(), gain: { value: 1 } };
  }
  createStereoPanner() {
    return { connect: vi.fn(), pan: { value: 0 } };
  }
  startRendering() {
    return Promise.resolve({ length: this.length, numberOfChannels: this.numberOfChannels, sampleRate: this.sampleRate, getChannelData: () => new Float32Array(this.length) });
  }
  destination = { connect: vi.fn() };
};

// Stub crypto.randomUUID if missing (jsdom)
if (!global.crypto || !global.crypto.randomUUID) {
  Object.defineProperty(global, "crypto", {
    value: {
      randomUUID: () => "00000000-0000-0000-0000-000000000000",
    },
    writable: true,
    configurable: true,
  });
}
