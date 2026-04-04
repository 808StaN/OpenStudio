import { configureStore, createAction, createSlice } from "@reduxjs/toolkit";

const makeFxSlots = function () {
  return Array.from({ length: 10 }).map(function (_, i) {
    return {
      id: "slot-" + (i + 1),
      name: "Slot " + (i + 1),
      enabled: false,
    };
  });
};

const makeSampleSettings = function () {
  return {
    cutItself: false,
    lengthPct: 100,
    fadeInPct: 0,
    fadeOutPct: 0,
  };
};

function nearlyEqual(a, b) {
  return Math.abs(a - b) <= 0.0001;
}

function makeStepRow(length, activeIndexes) {
  const row = Array(length).fill(false);
  activeIndexes.forEach(function (index) {
    if (index >= 0 && index < length) {
      row[index] = true;
    }
  });
  return row;
}

function makePatternStepGrid(channels, lengthSteps) {
  return channels.reduce(function (acc, channel) {
    acc[channel.id] = makeStepRow(lengthSteps, []);
    return acc;
  }, {});
}

const MIN_CLIP_BAR_LENGTH = 1 / 16;

function normalizeBarValue(raw, minValue, maxValue) {
  const normalized = Math.round(Number(raw || 0) * 16) / 16;
  return Math.max(minValue, Math.min(maxValue, normalized));
}

const DEFAULT_PATTERN_COLOR = "#4bef9f";

function getSafePatternColor(color) {
  const normalized = String(color || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    return normalized.toLowerCase();
  }

  return DEFAULT_PATTERN_COLOR;
}

function makeEmptyPattern(options) {
  const safeLength = Math.max(
    4,
    Math.min(128, Math.round(options.lengthSteps || 16)),
  );

  return {
    id: options.id,
    name: options.name,
    color: getSafePatternColor(options.color),
    lengthSteps: safeLength,
    stepGrid: makePatternStepGrid(options.channels || [], safeLength),
    pianoPreview: {},
  };
}

const initialState = {
  transport: {
    bpm: 140,
    isPlaying: false,
    isRecording: false,
    mode: "pattern",
    currentStep16: 0,
  },
  ui: {
    browserTab: "drumkits",
    channelRackMode: "sequencer",
    browserCollapsedFolders: {
      Drumkits: false,
      Plugins: false,
      "808 Mafia": false,
      "Nick Mira": true,
      Generators: false,
      Effects: true,
    },
    nextZ: 12,
    windows: {
      playlist: {
        open: true,
        z: 3,
        x: 300,
        y: 86,
        width: 960,
        height: 360,
        isMaximized: false,
        restoreRect: null,
      },
      channelRack: {
        open: true,
        z: 4,
        x: 350,
        y: 466,
        width: 800,
        height: 290,
        isMaximized: false,
        restoreRect: null,
      },
      pianoRoll: {
        open: false,
        z: 5,
        x: 420,
        y: 140,
        width: 760,
        height: 360,
        isMaximized: false,
        restoreRect: null,
      },
      mixer: {
        open: true,
        z: 6,
        x: 1170,
        y: 90,
        width: 650,
        height: 700,
        isMaximized: false,
        restoreRect: null,
      },
      sampleSettings: {
        open: false,
        z: 7,
        x: 910,
        y: 170,
        width: 560,
        height: 380,
        isMaximized: false,
        restoreRect: null,
      },
      patternList: {
        open: false,
        z: 8,
        x: 780,
        y: 140,
        width: 360,
        height: 440,
        isMaximized: false,
        restoreRect: null,
      },
    },
  },
  project: {
    activePatternId: "pat-1",
    activeChannelId: "ch-kick",
    channels: [
      {
        id: "ch-kick",
        name: "Kick",
        sampleRef: "",
        sampleSettings: makeSampleSettings(),
        muted: false,
        solo: false,
        volume: 0.84,
        pan: 0,
        inputMode: "steps",
        mixerInsertId: "insert-1",
      },
      {
        id: "ch-snare",
        name: "Snare",
        sampleRef: "",
        sampleSettings: makeSampleSettings(),
        muted: false,
        solo: false,
        volume: 0.8,
        pan: 0,
        inputMode: "steps",
        mixerInsertId: "insert-2",
      },
      {
        id: "ch-hat",
        name: "Hat",
        sampleRef: "",
        sampleSettings: makeSampleSettings(),
        muted: false,
        solo: false,
        volume: 0.65,
        pan: -0.15,
        inputMode: "piano",
        mixerInsertId: "insert-3",
      },
    ],
    patterns: [
      makeEmptyPattern({
        id: "pat-1",
        name: "Pattern 1",
        lengthSteps: 128,
        channels: [
          { id: "ch-kick" },
          { id: "ch-snare" },
          { id: "ch-hat" },
        ],
      }),
    ],
    playlistTracks: [
      { id: "trk-1", name: "Track 1" },
      { id: "trk-2", name: "Track 2" },
      { id: "trk-3", name: "Track 3" },
      { id: "trk-4", name: "Track 4" },
    ],
    playlistClips: [
      {
        id: "clip-1",
        patternId: "pat-1",
        trackId: "trk-1",
        barStart: 1,
        barLength: 2,
      },
      {
        id: "clip-2",
        patternId: "pat-1",
        trackId: "trk-2",
        barStart: 5,
        barLength: 2,
      },
    ],
  },
  mixer: {
    selectedInsertId: "insert-1",
    inserts: [
      {
        id: "master",
        name: "Master",
        isMaster: true,
        active: true,
        pan: 0,
        stereoSeparation: 0,
        fader: 1,
        meter: 0,
        routesTo: [],
        fxSlots: makeFxSlots(),
      },
      {
        id: "insert-1",
        name: "Insert 1",
        isMaster: false,
        active: true,
        pan: 0,
        stereoSeparation: 0,
        fader: 1,
        meter: 0,
        routesTo: ["master"],
        fxSlots: makeFxSlots(),
      },
      {
        id: "insert-2",
        name: "Insert 2",
        isMaster: false,
        active: true,
        pan: -0.08,
        stereoSeparation: -0.02,
        fader: 1,
        meter: 0,
        routesTo: ["master"],
        fxSlots: makeFxSlots(),
      },
      {
        id: "insert-3",
        name: "Insert 3",
        isMaster: false,
        active: true,
        pan: 0.11,
        stereoSeparation: 0.04,
        fader: 1,
        meter: 0,
        routesTo: ["master"],
        fxSlots: makeFxSlots(),
      },
      {
        id: "insert-4",
        name: "Insert 4",
        isMaster: false,
        active: false,
        pan: 0,
        stereoSeparation: 0,
        fader: 1,
        meter: 0,
        routesTo: ["master"],
        fxSlots: makeFxSlots(),
      },
    ],
  },
};

const undoLastChange = createAction("daw/undoLastChange");
const UNDO_HISTORY_LIMIT = 140;
const undoPastStates = [];
const undoFutureStates = [];
const nonUndoableActionTypes = new Set([
  "daw/setPlayheadStep",
  "daw/setInsertMeter",
  "daw/setPlaying",
  "daw/setRecording",
  "daw/setTransportMode",
  "daw/bringWindowToFront",
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

const dawSlice = createSlice({
  name: "daw",
  initialState,
  reducers: {
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
    setPlayheadStep(state, action) {
      state.transport.currentStep16 = Math.max(0, Math.round(action.payload));
    },

    openWindow(state, action) {
      state.ui.nextZ += 1;
      state.ui.windows[action.payload].open = true;
      state.ui.windows[action.payload].z = state.ui.nextZ;
    },
    closeWindow(state, action) {
      state.ui.windows[action.payload].open = false;
    },
    bringWindowToFront(state, action) {
      state.ui.nextZ += 1;
      state.ui.windows[action.payload].z = state.ui.nextZ;
    },
    setWindowRect(state, action) {
      const win = state.ui.windows[action.payload.id];
      win.x = action.payload.x;
      win.y = action.payload.y;
      win.width = action.payload.width;
      win.height = action.payload.height;
    },
    toggleWindowMaximize(state, action) {
      const win = state.ui.windows[action.payload.id];
      if (!win) {
        return;
      }

      if (win.isMaximized) {
        if (win.restoreRect) {
          win.x = win.restoreRect.x;
          win.y = win.restoreRect.y;
          win.width = win.restoreRect.width;
          win.height = win.restoreRect.height;
        }
        win.isMaximized = false;
        win.restoreRect = null;
        return;
      }

      const viewportWidth = Math.max(
        320,
        Math.round(action.payload.viewport?.width || win.width),
      );
      const viewportHeight = Math.max(
        220,
        Math.round(action.payload.viewport?.height || win.height),
      );

      win.restoreRect = {
        x: win.x,
        y: win.y,
        width: win.width,
        height: win.height,
      };
      win.x = 0;
      win.y = 0;
      win.width = viewportWidth;
      win.height = viewportHeight;
      win.isMaximized = true;
    },

    setBrowserTab(state, action) {
      state.ui.browserTab = action.payload;
    },
    setChannelRackMode(state, action) {
      const nextMode = action.payload;
      if (nextMode !== "sequencer" && nextMode !== "melody") {
        return;
      }
      state.ui.channelRackMode = nextMode;
    },
    toggleBrowserFolder(state, action) {
      const key = action.payload;
      state.ui.browserCollapsedFolders[key] =
        !state.ui.browserCollapsedFolders[key];
    },

    toggleStep(state, action) {
      const pattern = state.project.patterns.find(function (item) {
        return item.id === action.payload.patternId;
      });
      if (!pattern) {
        return;
      }
      const row = pattern.stepGrid[action.payload.channelId];
      if (!row) {
        return;
      }
      const index = action.payload.stepIndex;
      row[index] = !row[index];
    },

    setPatternLength(state, action) {
      const pattern = state.project.patterns.find(function (item) {
        return item.id === action.payload.patternId;
      });
      if (!pattern) {
        return;
      }

      const nextLength = Math.max(
        4,
        Math.min(128, Math.round(action.payload.length || 16)),
      );
      const prevLength = pattern.lengthSteps || 16;

      if (nextLength === prevLength) {
        return;
      }

      pattern.lengthSteps = nextLength;

      state.project.channels.forEach(function (channel) {
        const existingRow =
          pattern.stepGrid[channel.id] || Array(prevLength).fill(false);

        if (existingRow.length < nextLength) {
          pattern.stepGrid[channel.id] = existingRow.concat(
            Array(nextLength - existingRow.length).fill(false),
          );
          return;
        }

        pattern.stepGrid[channel.id] = existingRow.slice(0, nextLength);

        const existingNotes = pattern.pianoPreview?.[channel.id] || [];
        pattern.pianoPreview[channel.id] = existingNotes
          .filter(function (note) {
            return note.start < nextLength;
          })
          .map(function (note) {
            const maxLen = Math.max(0.0625, nextLength - note.start);
            return {
              ...note,
              length: Math.max(
                0.0625,
                Math.min(maxLen, Number(note.length || 1)),
              ),
            };
          });
      });

      if (state.transport.currentStep16 >= nextLength) {
        state.transport.currentStep16 = 0;
      }
    },

    setActivePattern(state, action) {
      const patternId = action.payload;
      const exists = state.project.patterns.some(function (pattern) {
        return pattern.id === patternId;
      });
      if (!exists) {
        return;
      }

      state.project.activePatternId = patternId;
    },

    createPattern(state, action) {
      const activePattern = state.project.patterns.find(function (item) {
        return item.id === state.project.activePatternId;
      });

      const requestedLength = Number(action.payload?.lengthSteps);
      const baseLength = Math.max(
        4,
        Math.min(
          128,
          Math.round(
            Number.isFinite(requestedLength)
              ? requestedLength
              : activePattern?.lengthSteps || 16,
          ),
        ),
      );

      const nextPatternNumber =
        state.project.patterns.reduce(function (maxValue, pattern) {
          const byName = String(pattern.name || "").match(/pattern\s+(\d+)/i);
          const byId = String(pattern.id || "").match(/pat-(\d+)/i);
          const parsedByName = byName ? Number(byName[1]) : 0;
          const parsedById = byId ? Number(byId[1]) : 0;
          return Math.max(maxValue, parsedByName, parsedById);
        }, 0) + 1;

      const newPatternId =
        "pat-" +
        Date.now().toString(36) +
        "-" +
        Math.random().toString(36).slice(2, 6);

      const newPattern = makeEmptyPattern({
        id: newPatternId,
        name: "Pattern " + nextPatternNumber,
        lengthSteps: baseLength,
        channels: state.project.channels,
      });

      state.project.patterns.push(newPattern);
      state.project.activePatternId = newPatternId;
    },

    renamePattern(state, action) {
      const pattern = state.project.patterns.find(function (item) {
        return item.id === action.payload.patternId;
      });
      if (!pattern) {
        return;
      }

      const nextName = String(action.payload.name || "").trim();
      if (!nextName) {
        return;
      }

      pattern.name = nextName.slice(0, 40);
    },

    setPatternColor(state, action) {
      const pattern = state.project.patterns.find(function (item) {
        return item.id === action.payload.patternId;
      });
      if (!pattern) {
        return;
      }

      const nextColor = getSafePatternColor(action.payload.color);
      if (pattern.color === nextColor) {
        return;
      }

      pattern.color = nextColor;
    },

    addPlaylistPatternClip(state, action) {
      const patternId = action.payload.patternId || state.project.activePatternId;
      const pattern = state.project.patterns.find(function (item) {
        return item.id === patternId;
      });
      if (!pattern) {
        return;
      }

      const trackId = action.payload.trackId;
      const hasTrack = state.project.playlistTracks.some(function (track) {
        return track.id === trackId;
      });
      if (!hasTrack) {
        return;
      }

      const barStart = normalizeBarValue(action.payload.barStart || 1, 1, 128);

      const patternBarLength = Math.max(1, Math.ceil((pattern.lengthSteps || 16) / 16));
      const barLength = normalizeBarValue(
        action.payload.barLength || patternBarLength,
        MIN_CLIP_BAR_LENGTH,
        64,
      );
      const newClipEnd = barStart + barLength;

      state.project.playlistClips = state.project.playlistClips.filter(function (clip) {
        if (clip.trackId !== trackId) {
          return true;
        }

        const start = normalizeBarValue(clip.barStart || 1, 1, 128);
        const length = normalizeBarValue(
          clip.barLength || 1,
          MIN_CLIP_BAR_LENGTH,
          64,
        );
        const end = start + length;

        return end <= barStart || start >= newClipEnd;
      });

      state.project.playlistClips.push({
        id:
          "clip-" +
          Date.now().toString(36) +
          "-" +
          Math.random().toString(36).slice(2, 6),
        patternId,
        trackId,
        barStart,
        barLength,
      });

      const trackOrderById = state.project.playlistTracks.reduce(function (
        acc,
        track,
        index,
      ) {
        acc[track.id] = index;
        return acc;
      }, {});

      state.project.playlistClips.sort(function (a, b) {
        const trackDelta =
          (trackOrderById[a.trackId] ?? 999) - (trackOrderById[b.trackId] ?? 999);
        if (trackDelta !== 0) {
          return trackDelta;
        }

        return a.barStart - b.barStart;
      });
    },

    removePlaylistClip(state, action) {
      state.project.playlistClips = state.project.playlistClips.filter(
        function (clip) {
          return clip.id !== action.payload;
        },
      );
    },

    setPlaylistClipLength(state, action) {
      const clip = state.project.playlistClips.find(function (item) {
        return item.id === action.payload.clipId;
      });
      if (!clip) {
        return;
      }

      const trackClips = state.project.playlistClips
        .filter(function (item) {
          return item.trackId === clip.trackId && item.id !== clip.id;
        })
        .sort(function (a, b) {
          return a.barStart - b.barStart;
        });

      const nextClip = trackClips.find(function (item) {
        return item.barStart > clip.barStart;
      });

      const maxLengthByNextClip = nextClip
        ? Math.max(MIN_CLIP_BAR_LENGTH, nextClip.barStart - clip.barStart)
        : 64;

      const currentStart = normalizeBarValue(clip.barStart || 1, 1, 128);
      const maxLengthByTimeline = Math.max(
        MIN_CLIP_BAR_LENGTH,
        128 - currentStart + 1,
      );
      const requestedLength = normalizeBarValue(
        action.payload.barLength || 1,
        MIN_CLIP_BAR_LENGTH,
        64,
      );

      clip.barLength = normalizeBarValue(
        requestedLength,
        MIN_CLIP_BAR_LENGTH,
        Math.min(maxLengthByNextClip, maxLengthByTimeline),
      );
    },

    setPlaylistClipPlacement(state, action) {
      const clip = state.project.playlistClips.find(function (item) {
        return item.id === action.payload.clipId;
      });
      if (!clip) {
        return;
      }

      const trackId = action.payload.trackId || clip.trackId;
      const hasTrack = state.project.playlistTracks.some(function (track) {
        return track.id === trackId;
      });
      if (!hasTrack) {
        return;
      }

      const clipLength = normalizeBarValue(
        clip.barLength || 1,
        MIN_CLIP_BAR_LENGTH,
        64,
      );
      const maxStartByTimeline = Math.max(1, 128 - clipLength + 1);
      const desiredStart = normalizeBarValue(
        action.payload.barStart || 1,
        1,
        maxStartByTimeline,
      );

      const clipsOnTargetTrack = state.project.playlistClips.filter(function (item) {
        return item.trackId === trackId && item.id !== clip.id;
      });

      const isSlotFree = function (start) {
        const end = start + clipLength;

        return clipsOnTargetTrack.every(function (item) {
          const otherStart = normalizeBarValue(item.barStart || 1, 1, 128);
          const otherLength = normalizeBarValue(
            item.barLength || 1,
            MIN_CLIP_BAR_LENGTH,
            64,
          );
          const otherEnd = otherStart + otherLength;
          return otherEnd <= start || otherStart >= end;
        });
      };

      let resolvedStart = desiredStart;
      if (!isSlotFree(resolvedStart)) {
        const moveDirection = Math.sign(desiredStart - clip.barStart);
        let foundStart = null;

        for (let delta = 1; delta <= maxStartByTimeline; delta += 1) {
          const left = desiredStart - delta;
          const right = desiredStart + delta;
          const canLeft = left >= 1 && isSlotFree(left);
          const canRight = right <= maxStartByTimeline && isSlotFree(right);

          if (!canLeft && !canRight) {
            continue;
          }

          if (canLeft && canRight) {
            foundStart = moveDirection >= 0 ? right : left;
          } else {
            foundStart = canRight ? right : left;
          }
          break;
        }

        if (foundStart === null) {
          return;
        }

        resolvedStart = foundStart;
      }

      clip.trackId = trackId;
      clip.barStart = resolvedStart;

      const trackOrderById = state.project.playlistTracks.reduce(function (
        acc,
        track,
        index,
      ) {
        acc[track.id] = index;
        return acc;
      }, {});

      state.project.playlistClips.sort(function (a, b) {
        const trackDelta =
          (trackOrderById[a.trackId] ?? 999) - (trackOrderById[b.trackId] ?? 999);
        if (trackDelta !== 0) {
          return trackDelta;
        }

        return a.barStart - b.barStart;
      });
    },

    setActiveChannel(state, action) {
      const channelId = action.payload;
      const exists = state.project.channels.some(function (channel) {
        return channel.id === channelId;
      });

      if (!exists) {
        return;
      }

      state.project.activeChannelId = channelId;
    },

    togglePianoNote(state, action) {
      const pattern = state.project.patterns.find(function (item) {
        return item.id === action.payload.patternId;
      });
      if (!pattern) {
        return;
      }

      const channelId = action.payload.channelId;
      if (!pattern.pianoPreview) {
        pattern.pianoPreview = {};
      }
      if (!pattern.pianoPreview[channelId]) {
        pattern.pianoPreview[channelId] = [];
      }

      const patternLength = Math.max(1, pattern.lengthSteps || 16);
      const start = Math.max(
        0,
        Math.min(patternLength - 0.0625, Number(action.payload.start || 0)),
      );
      const pitch = Math.round(action.payload.pitch || 72);
      const maxLen = Math.max(0.0625, patternLength - start);
      const length = Math.max(
        0.0625,
        Math.min(maxLen, Number(action.payload.length || 1)),
      );

      const notes = pattern.pianoPreview[channelId];
      const existingIndex = notes.findIndex(function (note) {
        return nearlyEqual(note.start || 0, start) && note.pitch === pitch;
      });

      if (existingIndex >= 0) {
        notes.splice(existingIndex, 1);
        return;
      }

      notes.push({
        id:
          action.payload.id ||
          "n-" +
            channelId +
            "-" +
            Date.now().toString(36) +
            "-" +
            Math.random().toString(36).slice(2, 7),
        start,
        length,
        pitch,
      });
    },

    setPianoNoteLength(state, action) {
      const pattern = state.project.patterns.find(function (item) {
        return item.id === action.payload.patternId;
      });
      if (!pattern) {
        return;
      }

      const channelId = action.payload.channelId;
      const notes = pattern.pianoPreview?.[channelId];
      if (!notes) {
        return;
      }

      const start = Number(action.payload.start || 0);
      const pitch = Math.round(action.payload.pitch || 72);
      const note =
        notes.find(function (item) {
          return item.id === action.payload.noteId;
        }) ||
        notes.find(function (item) {
          return nearlyEqual(item.start || 0, start) && item.pitch === pitch;
        });
      if (!note) {
        return;
      }

      const patternLength = Math.max(1, pattern.lengthSteps || 16);
      const maxLen = Math.max(0.0625, patternLength - note.start);
      note.length = Math.max(
        0.0625,
        Math.min(maxLen, Number(action.payload.length || note.length || 1)),
      );
    },

    movePianoNote(state, action) {
      const pattern = state.project.patterns.find(function (item) {
        return item.id === action.payload.patternId;
      });
      if (!pattern) {
        return;
      }

      const channelId = action.payload.channelId;
      const notes = pattern.pianoPreview?.[channelId];
      if (!notes) {
        return;
      }

      const start = Number(action.payload.start || 0);
      const pitch = Math.round(action.payload.pitch || 72);
      const note =
        notes.find(function (item) {
          return item.id === action.payload.noteId;
        }) ||
        notes.find(function (item) {
          return nearlyEqual(item.start || 0, start) && item.pitch === pitch;
        });
      if (!note) {
        return;
      }

      const patternLength = Math.max(1, pattern.lengthSteps || 16);
      const nextStart = Math.max(
        0,
        Math.min(patternLength - 0.0625, Number(action.payload.nextStart || 0)),
      );
      const nextPitch = Math.round(action.payload.nextPitch || note.pitch);

      note.start = nextStart;
      note.pitch = nextPitch;

      const maxLen = Math.max(0.0625, patternLength - note.start);
      note.length = Math.max(
        0.0625,
        Math.min(maxLen, Number(note.length || 1)),
      );
    },

    setChannelInputMode(state, action) {
      const channel = state.project.channels.find(function (item) {
        return item.id === action.payload.channelId;
      });
      if (!channel) {
        return;
      }
      channel.inputMode = action.payload.mode;
    },

    setChannelMute(state, action) {
      const channel = state.project.channels.find(function (item) {
        return item.id === action.payload.channelId;
      });
      if (!channel) {
        return;
      }
      channel.muted = action.payload.value;
    },

    setChannelSolo(state, action) {
      const channel = state.project.channels.find(function (item) {
        return item.id === action.payload.channelId;
      });
      if (!channel) {
        return;
      }
      channel.solo = action.payload.value;
    },

    setChannelVolume(state, action) {
      const channel = state.project.channels.find(function (item) {
        return item.id === action.payload.channelId;
      });
      if (!channel) {
        return;
      }
      channel.volume = Math.max(0, Math.min(1, action.payload.value));
    },

    setChannelPan(state, action) {
      const channel = state.project.channels.find(function (item) {
        return item.id === action.payload.channelId;
      });
      if (!channel) {
        return;
      }
      channel.pan = Math.max(-1, Math.min(1, action.payload.value));
    },

    setChannelMixerInsert(state, action) {
      const channel = state.project.channels.find(function (item) {
        return item.id === action.payload.channelId;
      });
      if (!channel) {
        return;
      }

      const insertId = action.payload.insertId;
      const exists = state.mixer.inserts.some(function (insert) {
        return insert.id === insertId;
      });
      if (!exists) {
        return;
      }

      channel.mixerInsertId = insertId;
    },

    setChannelSampleSettings(state, action) {
      const channel = state.project.channels.find(function (item) {
        return item.id === action.payload.channelId;
      });
      if (!channel) {
        return;
      }

      if (!channel.sampleSettings) {
        channel.sampleSettings = makeSampleSettings();
      }

      const changes = action.payload.changes || {};
      const next = channel.sampleSettings;

      if (Object.hasOwn(changes, "cutItself")) {
        next.cutItself = Boolean(changes.cutItself);
      }

      if (Object.hasOwn(changes, "lengthPct")) {
        next.lengthPct = Math.max(
          5,
          Math.min(100, Number(changes.lengthPct || next.lengthPct)),
        );
      }

      if (Object.hasOwn(changes, "fadeInPct")) {
        next.fadeInPct = Math.max(
          0,
          Math.min(95, Number(changes.fadeInPct || next.fadeInPct)),
        );
      }

      if (Object.hasOwn(changes, "fadeOutPct")) {
        next.fadeOutPct = Math.max(
          0,
          Math.min(95, Number(changes.fadeOutPct || next.fadeOutPct)),
        );
      }

      const fadeTotal = next.fadeInPct + next.fadeOutPct;
      if (fadeTotal > 98) {
        const scale = 98 / fadeTotal;
        next.fadeInPct = Math.max(0, Math.round(next.fadeInPct * scale));
        next.fadeOutPct = Math.max(0, Math.round(next.fadeOutPct * scale));
      }
    },

    assignSampleToChannel(state, action) {
      const channel = state.project.channels.find(function (item) {
        return item.id === action.payload.channelId;
      });
      if (!channel) {
        return;
      }
      channel.sampleRef = action.payload.sampleRef;
      const sourceName = action.payload.sampleName || action.payload.sampleRef;
      channel.name = sourceName
        .split("/")
        .pop()
        .replace(/\.[^.]+$/, "")
        .slice(0, 14);
    },

    selectInsert(state, action) {
      state.mixer.selectedInsertId = action.payload;
    },

    setInsertActive(state, action) {
      const insert = state.mixer.inserts.find(function (item) {
        return item.id === action.payload.insertId;
      });
      if (!insert) {
        return;
      }
      insert.active = action.payload.value;
    },

    setInsertPan(state, action) {
      const insert = state.mixer.inserts.find(function (item) {
        return item.id === action.payload.insertId;
      });
      if (!insert) {
        return;
      }
      insert.pan = Math.max(-1, Math.min(1, action.payload.value));
    },

    setInsertStereo(state, action) {
      const insert = state.mixer.inserts.find(function (item) {
        return item.id === action.payload.insertId;
      });
      if (!insert) {
        return;
      }
      insert.stereoSeparation = Math.max(-1, Math.min(1, action.payload.value));
    },

    setInsertFader(state, action) {
      const insert = state.mixer.inserts.find(function (item) {
        return item.id === action.payload.insertId;
      });
      if (!insert) {
        return;
      }
      insert.fader = Math.max(0, Math.min(1.25, action.payload.value));
    },

    toggleFxSlot(state, action) {
      const insert = state.mixer.inserts.find(function (item) {
        return item.id === action.payload.insertId;
      });
      if (!insert) {
        return;
      }
      const slot = insert.fxSlots.find(function (item) {
        return item.id === action.payload.slotId;
      });
      if (!slot) {
        return;
      }
      slot.enabled = !slot.enabled;
    },

    setInsertMeter(state, action) {
      const insert = state.mixer.inserts.find(function (item) {
        return item.id === action.payload.insertId;
      });
      if (!insert) {
        return;
      }
      insert.meter = Math.max(0, Math.min(1, action.payload.meter));
    },
  },
});

const dawReducerWithUndo = function (state = initialState, action) {
  if (action.type === undoLastChange.type) {
    const previousState = undoPastStates.pop();
    if (!previousState) {
      return state;
    }

    undoFutureStates.push(state);
    return previousState;
  }

  const nextState = dawSlice.reducer(state, action);
  if (nextState === state) {
    return state;
  }

  if (shouldTrackUndoForAction(action)) {
    undoPastStates.push(state);
    if (undoPastStates.length > UNDO_HISTORY_LIMIT) {
      undoPastStates.shift();
    }
    undoFutureStates.length = 0;
  }

  return nextState;
};

export const {
  setBpm,
  setPlaying,
  setRecording,
  setTransportMode,
  setPlayheadStep,
  openWindow,
  closeWindow,
  bringWindowToFront,
  setWindowRect,
  toggleWindowMaximize,
  setBrowserTab,
  setChannelRackMode,
  toggleBrowserFolder,
  toggleStep,
  setPatternLength,
  setActivePattern,
  createPattern,
  renamePattern,
  setPatternColor,
  addPlaylistPatternClip,
  removePlaylistClip,
  setPlaylistClipLength,
  setPlaylistClipPlacement,
  setActiveChannel,
  togglePianoNote,
  setPianoNoteLength,
  movePianoNote,
  setChannelInputMode,
  setChannelMute,
  setChannelSolo,
  setChannelVolume,
  setChannelPan,
  setChannelMixerInsert,
  setChannelSampleSettings,
  assignSampleToChannel,
  selectInsert,
  setInsertActive,
  setInsertPan,
  setInsertStereo,
  setInsertFader,
  toggleFxSlot,
  setInsertMeter,
} = dawSlice.actions;

export { undoLastChange };

export const store = configureStore({
  reducer: {
    daw: dawReducerWithUndo,
  },
});
