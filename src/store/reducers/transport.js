// ------------------------------------------------------------------
// Transport reducers — BPM, playback, recording, playhead.
// These are intentionally lightweight because the audio scheduler
// handles the actual timing; Redux only stores the "requested" state.
// ------------------------------------------------------------------

export const transportReducers = {
  setBpm(state, action) {
    state.transport.bpm = Math.max(
      40,
      Math.min(300, Math.round(action.payload)),
    );
  },

  setPlaying(state, action) {
    state.transport.isPlaying = action.payload;
    if (!action.payload) {
      state.transport.currentStep16 = 0;
    }
  },

  setRecording(state, action) {
    state.transport.isRecording = action.payload;
  },

  setTransportMode(state, action) {
    state.transport.mode = action.payload;
  },

  setSongLoopEnabled(state, action) {
    state.transport.songLoopEnabled = Boolean(action.payload);
  },

  setPlayheadStep(state, action) {
    state.transport.currentStep16 = Math.max(0, Math.round(action.payload));
  },
};
