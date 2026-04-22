// C5 is the neutral sample pitch anchor used across preview/playback code.
export const DEFAULT_SAMPLE_MIDI_PITCH = 72;

export function midiPitchToPlaybackRate(midiPitch) {
  // Convert semitone distance to playback-rate multiplier (12-TET).
  const semitoneOffset = Number(midiPitch || DEFAULT_SAMPLE_MIDI_PITCH) - DEFAULT_SAMPLE_MIDI_PITCH;
  const rawRate = Math.pow(2, semitoneOffset / 12);
  // Keep rate in an audio-safe range expected by scheduler and renderer.
  return Math.max(0.125, Math.min(8, rawRate));
}
