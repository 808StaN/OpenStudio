import { configureStore, createAction, createSlice } from "@reduxjs/toolkit";
import { initialState } from "./store/initialState";
import { sanitizeLoadedDawState } from "./store/loadState";
import { transportReducers } from "./store/reducers/transport";
import { uiReducers } from "./store/reducers/ui";
import { projectReducers } from "./store/reducers/project";
import { mixerReducers } from "./store/reducers/mixer";
import { userReducer } from "./store/userSlice";

// ------------------------------------------------------------------
// Undo / redo bookkeeping
// We keep two stacks outside Redux so the undo system itself does not
// trigger additional state changes inside the store subscription loop.
// ------------------------------------------------------------------

const undoLastChange = createAction("daw/undoLastChange");
const undoPastStates = [];
const undoFutureStates = [];

const LOAD_PROJECT_FROM_FILE_ACTION = "daw/loadProjectFromFile";
const RESET_TO_DEFAULT_PROJECT_ACTION = "daw/resetToDefaultProject";

// Actions that only affect transient UI or playback state should not pollute
// the undo history; reverting them would feel unpredictable to the user.
const nonUndoableActionTypes = new Set([
  "daw/setPlayheadStep",
  "daw/setInsertMeter",
  "daw/setPlaying",
  "daw/setRecording",
  "daw/setTransportMode",
  "daw/setTheme",
  "daw/bringWindowToFront",
  "daw/setPianoRollScale",
  LOAD_PROJECT_FROM_FILE_ACTION,
  RESET_TO_DEFAULT_PROJECT_ACTION,
]);

function shouldTrackUndoForAction(action) {
  if (!action || typeof action.type !== "string") {
    return false;
  }

  if (action.type.startsWith("@@")) {
    return false;
  }

  if (action.type === undoLastChange.type) {
    return false;
  }

  if (nonUndoableActionTypes.has(action.type)) {
    return false;
  }

  return true;
}

// ------------------------------------------------------------------
// Main slice — composed from domain-specific reducer objects.
// We deliberately keep the original slice name "daw" so every existing
// action type string (e.g. "daw/setBpm") stays identical. That guarantees
// backward compatibility with saved .os files, DevTools histories, and
// any external integrations that rely on action type constants.
// ------------------------------------------------------------------

const dawSlice = createSlice({
  name: "daw",
  initialState,
  reducers: {
    ...transportReducers,
    ...uiReducers,
    ...projectReducers,
    ...mixerReducers,

    // Project I/O reducers are kept inline because they need access to
    // sanitizeLoadedDawState, which itself depends on initialState.
    // Keeping them here avoids threading extra arguments through every
    // extracted reducer file.

    loadProjectFromFile(state, action) {
      const sanitizedState = sanitizeLoadedDawState(state, action.payload);
      if (!sanitizedState) {
        return state;
      }
      return sanitizedState;
    },

    resetToDefaultProject() {
      // Deep-clone so subsequent mutations do not corrupt the original constant.
      try {
        return JSON.parse(JSON.stringify(initialState));
      } catch {
        return initialState;
      }
    },
  },
});

// ------------------------------------------------------------------
// Undo-enhanced reducer wrapper.
// This wraps the Immer-powered slice reducer with simple stack-based
// history. It is intentionally outside the slice so Redux DevTools
// still sees the original "daw/..." actions rather than wrapper noise.
// ------------------------------------------------------------------

const dawReducerWithUndo = function (state = initialState, action) {
  if (action.type === undoLastChange.type) {
    const previousState = undoPastStates.pop();
    if (!previousState) {
      return state;
    }

    undoFutureStates.push(state);
    return previousState;
  }

  if (action.type === LOAD_PROJECT_FROM_FILE_ACTION) {
    const loadedState = dawSlice.reducer(state, action);
    if (loadedState !== state) {
      undoPastStates.length = 0;
      undoFutureStates.length = 0;
    }
    return loadedState;
  }

  if (action.type === RESET_TO_DEFAULT_PROJECT_ACTION) {
    const resetState = dawSlice.reducer(state, action);
    if (resetState !== state) {
      undoPastStates.length = 0;
      undoFutureStates.length = 0;
    }
    return resetState;
  }

  const nextState = dawSlice.reducer(state, action);
  if (nextState === state) {
    return state;
  }

  if (shouldTrackUndoForAction(action)) {
    undoPastStates.push(state);
    if (undoPastStates.length > 140) {
      undoPastStates.shift();
    }
    undoFutureStates.length = 0;
  }

  return nextState;
};

// ------------------------------------------------------------------
// Store instance
// ------------------------------------------------------------------

export const store = configureStore({
  reducer: {
    daw: dawReducerWithUndo,
    user: userReducer,
  },
});

// ------------------------------------------------------------------
// Named action exports — must stay 1:1 with the previous store API so
// every component import continues to work without modification.
// ------------------------------------------------------------------

export const {
  setBpm,
  setPlaying,
  setRecording,
  setTransportMode,
  setSongLoopEnabled,
  setPlayheadStep,
  loadProjectFromFile,
  resetToDefaultProject,
  openWindow,
  closeWindow,
  bringWindowToFront,
  setWindowRect,
  toggleWindowMaximize,
  setTheme,
  setBrowserTab,
  setPatternClipboard,
  setPianoRollScale,
  setFxEditorTarget,
  setChannelRackMode,
  toggleBrowserFolder,
  toggleStep,
  setPatternLength,
  setActivePattern,
  createPattern,
  duplicatePatterns,
  renamePattern,
  setPatternColor,
  addPlaylistPatternClip,
  addPlaylistAudioClip,
  addPlaylistSampleAsChannel,
  addPlaylistTrack,
  removePlaylistClip,
  setPlaylistClipLength,
  setPlaylistClipPlacement,
  setPlaylistClipTrimStart,
  setActiveChannel,
  addChannel,
  renameChannel,
  duplicateChannel,
  removeChannel,
  togglePianoNote,
  setPianoNoteLength,
  setPianoNoteVelocity,
  movePianoNote,
  addPianoNotesBatch,
  movePianoNotesBatch,
  removePianoNotesBatch,
  pasteMidiPatternToChannel,
  setChannelInputMode,
  setChannelMute,
  setChannelSolo,
  setChannelVolume,
  setChannelPan,
  setChannelMixerInsert,
  setChannelSampleSettings,
  assignSampleToChannel,
  assignPluginToChannel,
  selectInsert,
  addMixerTrack,
  setInsertActive,
  setInsertPan,
  setInsertStereo,
  setInsertFader,
  toggleFxSlot,
  setFxSlotEffectType,
  setFxSlotGraphicEqBandGain,
  setFxSlotGraphicEqLowCut,
  setFxSlotGraphicEqPoint,
  setFxSlotReverbParam,
  setFxSlotMaximizerParam,
  setInsertMeter,
} = dawSlice.actions;

export { undoLastChange };
