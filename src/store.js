import { configureStore, createAction, createSlice } from "@reduxjs/toolkit";

const FX_SLOT_EFFECT_NONE = "none";
const FX_SLOT_EFFECT_GRAPHIC_EQ = "graphic-eq";
const FX_SLOT_EFFECT_REVERB = "reverb";
const SAMPLE_STRETCH_MODES = new Set([
  "none",
  "resample",
  "stretch",
  "realtime",
]);
const SAMPLE_STRETCH_TIME_MODES = new Set([
  "none",
  "set-bpm",
  "project-tempo",
  "beat-1",
  "beat-2",
  "bar-1",
  "bar-2",
  "bar-3",
  "bar-4",
]);
const DEFAULT_INSERT_SPECTRUM_BINS = 112;
const GRAPHIC_EQ_DEFAULT_POINT_FREQUENCIES = [
  50, 100, 250, 500, 1000, 3000, 8000,
];
const GRAPHIC_EQ_BAND_TYPES = [
  "peaking",
  "lowshelf",
  "highshelf",
  "lowpass",
  "highpass",
];
const DEFAULT_MIDI_PITCH = 72;

function getDefaultEqBandType(index) {
  if (index === 0) {
    return "lowshelf";
  }

  if (index === GRAPHIC_EQ_DEFAULT_POINT_FREQUENCIES.length - 1) {
    return "highshelf";
  }

  return "peaking";
}

function sanitizeEqBandType(raw, fallback) {
  const requested = String(raw || "")
    .trim()
    .toLowerCase();
  if (GRAPHIC_EQ_BAND_TYPES.includes(requested)) {
    return requested;
  }

  const safeFallback = String(fallback || "")
    .trim()
    .toLowerCase();
  if (GRAPHIC_EQ_BAND_TYPES.includes(safeFallback)) {
    return safeFallback;
  }

  return "peaking";
}

function clampEqBandGainDb(raw) {
  const value = Number(raw || 0);
  return Math.max(-18, Math.min(18, value));
}

function clampEqFrequencyHz(raw) {
  const value = Number(raw || 20);
  return Math.max(20, Math.min(20000, value));
}

function clampEqQ(raw) {
  const value = Number(raw || 1.2);
  return Math.max(0.25, Math.min(8, value));
}

function makeGraphicEqParams() {
  return {
    points: GRAPHIC_EQ_DEFAULT_POINT_FREQUENCIES.map(
      function (frequencyHz, index) {
        return {
          frequencyHz,
          gainDb: 0,
          q: 1.2,
          bandType: getDefaultEqBandType(index),
        };
      },
    ),
  };
}

function clampReverb01(raw, fallback) {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, value));
}

function clampReverbInRange(raw, min, max, fallback) {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, value));
}

function makeReverbParams() {
  return {
    decayTime: 2.8,
    preDelayMs: 24,
    size: 0.62,
    damping: 0.45,
    hiCutHz: 9000,
    loCutHz: 130,
    earlyReflections: 0.38,
    diffusion: 0.72,
    modulationDepth: 0.22,
    modulationRateHz: 0.35,
    width: 0.9,
    dryWet: 0.34,
    freeze: false,
  };
}

function getSafeReverbParams(raw) {
  const base = {
    ...makeReverbParams(),
    ...(raw || {}),
  };

  return {
    decayTime: clampReverbInRange(base.decayTime, 0.2, 20, 2.8),
    preDelayMs: clampReverbInRange(base.preDelayMs, 0, 250, 24),
    size: clampReverb01(base.size, 0.62),
    damping: clampReverb01(base.damping, 0.45),
    hiCutHz: clampReverbInRange(base.hiCutHz, 1200, 18000, 9000),
    loCutHz: clampReverbInRange(base.loCutHz, 20, 1200, 130),
    earlyReflections: clampReverb01(base.earlyReflections, 0.38),
    diffusion: clampReverb01(base.diffusion, 0.72),
    modulationDepth: clampReverb01(base.modulationDepth, 0.22),
    modulationRateHz: clampReverbInRange(base.modulationRateHz, 0, 8, 0.35),
    width: clampReverb01(base.width, 0.9),
    dryWet: clampReverb01(base.dryWet, 0.34),
    freeze: Boolean(base.freeze),
  };
}

function makeInsertSpectrum() {
  return Array.from({ length: DEFAULT_INSERT_SPECTRUM_BINS }).map(function () {
    return 0;
  });
}

function getSafeGraphicEqParams(raw) {
  const defaultParams = makeGraphicEqParams();
  const requestedPoints = Array.isArray(raw?.points) ? raw.points : [];
  const legacyBands = Array.isArray(raw?.bands) ? raw.bands : [];

  return {
    points: defaultParams.points.map(function (defaultPoint, index) {
      const requestedPoint = requestedPoints[index];
      const hasLegacyGain = index < legacyBands.length;

      return {
        frequencyHz: clampEqFrequencyHz(
          requestedPoint?.frequencyHz ?? defaultPoint.frequencyHz,
        ),
        gainDb: clampEqBandGainDb(
          requestedPoint?.gainDb ?? (hasLegacyGain ? legacyBands[index] : 0),
        ),
        q: clampEqQ(requestedPoint?.q ?? defaultPoint.q),
        bandType: sanitizeEqBandType(
          requestedPoint?.bandType,
          defaultPoint.bandType,
        ),
      };
    }),
  };
}

function getFxSlotDefaultName(index) {
  return "Slot " + (index + 1);
}

function normalizeFxSlot(slot, index) {
  const rawEffectType = String(slot?.effectType || "")
    .trim()
    .toLowerCase();
  const effectType =
    rawEffectType === FX_SLOT_EFFECT_GRAPHIC_EQ
      ? FX_SLOT_EFFECT_GRAPHIC_EQ
      : rawEffectType === FX_SLOT_EFFECT_REVERB
        ? FX_SLOT_EFFECT_REVERB
        : FX_SLOT_EFFECT_NONE;
  const defaultName =
    effectType === FX_SLOT_EFFECT_GRAPHIC_EQ
      ? "Graphic EQ"
      : effectType === FX_SLOT_EFFECT_REVERB
        ? "Reverb"
        : getFxSlotDefaultName(index);

  return {
    id: slot?.id || "slot-" + (index + 1),
    name: String(slot?.name || "").trim() || defaultName,
    enabled:
      effectType === FX_SLOT_EFFECT_NONE ? false : Boolean(slot?.enabled),
    effectType,
    params:
      effectType === FX_SLOT_EFFECT_GRAPHIC_EQ
        ? getSafeGraphicEqParams(slot?.params)
        : effectType === FX_SLOT_EFFECT_REVERB
          ? getSafeReverbParams(slot?.params)
          : null,
  };
}

function ensureInsertFxSlots(insert) {
  const nextSlots = Array.from({ length: 10 }).map(function (_, index) {
    const existing = Array.isArray(insert?.fxSlots)
      ? insert.fxSlots[index]
      : null;

    if (existing) {
      return normalizeFxSlot(existing, index);
    }

    return {
      id: "slot-" + (index + 1),
      name: getFxSlotDefaultName(index),
      enabled: false,
      effectType: FX_SLOT_EFFECT_NONE,
      params: null,
    };
  });

  insert.fxSlots = nextSlots;
}

const makeFxSlots = function () {
  return Array.from({ length: 10 }).map(function (_, index) {
    return {
      id: "slot-" + (index + 1),
      name: getFxSlotDefaultName(index),
      enabled: false,
      effectType: FX_SLOT_EFFECT_NONE,
      params: null,
    };
  });
};

const makeSampleSettings = function () {
  return {
    cutItself: false,
    normalize: false,
    lengthPct: 100,
    fadeInPct: 0,
    fadeOutPct: 0,
    envEnabled: false,
    envDelayMs: 0,
    envAttackMs: 0,
    envHoldMs: 0,
    envDecayMs: 0,
    envSustainPct: 100,
    envReleaseMs: 0,
    attackMs: 8,
    releaseMs: 420,
    pitchCents: 0,
    monoMode: false,
    stretchMode: "resample",
    stretchPitchSemitones: 0,
    stretchMultiplier: 1,
    stretchSourceBpm: 120,
    stretchProjectTempoBpm: 120,
    stretchTimeMode: "none",
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

function makePlaylistTracks(count) {
  return Array.from({ length: count }).map(function (_, index) {
    const number = index + 1;
    return {
      id: "trk-" + number,
      name: "Track " + number,
    };
  });
}

function makePatternStepGrid(channels, lengthSteps) {
  return channels.reduce(function (acc, channel) {
    acc[channel.id] = makeStepRow(lengthSteps, []);
    return acc;
  }, {});
}

function makeChannelId() {
  return (
    "ch-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 6)
  );
}

function makeMidiPatternNoteId(prefix) {
  return (
    prefix +
    "-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 7)
  );
}

const MIN_CLIP_BAR_LENGTH = 1 / 16;
const MAX_PLAYLIST_BARS = 512;

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

function getNextPatternNumber(patterns) {
  return (
    patterns.reduce(function (maxValue, pattern) {
      const byName = String(pattern.name || "").match(/pattern\s+(\d+)/i);
      const byId = String(pattern.id || "").match(/pat-(\d+)/i);
      const parsedByName = byName ? Number(byName[1]) : 0;
      const parsedById = byId ? Number(byId[1]) : 0;
      return Math.max(maxValue, parsedByName, parsedById);
    }, 0) + 1
  );
}

function clonePatternForCopy(sourcePattern, nextId, nextName) {
  const safeLength = Math.max(
    4,
    Math.min(128, Math.round(Number(sourcePattern.lengthSteps || 16))),
  );

  const clonedStepGrid = Object.entries(sourcePattern.stepGrid || {}).reduce(
    function (acc, entry) {
      const channelId = entry[0];
      const row = entry[1];
      const safeRow = Array.isArray(row) ? row.slice(0, safeLength) : [];

      if (safeRow.length < safeLength) {
        safeRow.push(...Array(safeLength - safeRow.length).fill(false));
      }

      acc[channelId] = safeRow.map(Boolean);
      return acc;
    },
    {},
  );

  const clonedPianoPreview = Object.entries(
    sourcePattern.pianoPreview || {},
  ).reduce(function (acc, entry) {
    const channelId = entry[0];
    const notes = entry[1];

    acc[channelId] = (notes || []).map(function (note) {
      return {
        ...note,
        start: Math.max(
          0,
          Math.min(safeLength - 0.0625, Number(note.start || 0)),
        ),
        length: Math.max(0.0625, Number(note.length || 1)),
      };
    });

    return acc;
  }, {});

  return {
    id: nextId,
    name: String(nextName || sourcePattern.name || "Pattern").slice(0, 40),
    color: getSafePatternColor(sourcePattern.color),
    lengthSteps: safeLength,
    stepGrid: clonedStepGrid,
    pianoPreview: clonedPianoPreview,
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
    patternClipboardIds: [],
    fxEditorTarget: {
      insertId: "insert-1",
      slotId: "slot-1",
    },
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
        x: 0,
        y: 0,
        width: 960,
        height: 360,
        isMaximized: false,
        startMaximized: true,
        restoreRect: null,
      },
      channelRack: {
        open: true,
        z: 4,
        x: 350,
        y: 466,
        width: 800,
        height: 320,
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
        open: false,
        z: 6,
        x: 1170,
        y: 90,
        width: 650,
        height: 450,
        isMaximized: false,
        restoreRect: null,
      },
      fxPlugin: {
        open: false,
        z: 9,
        x: 980,
        y: 150,
        width: 540,
        height: 460,
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
      renderExport: {
        open: false,
        z: 10,
        x: 880,
        y: 120,
        width: 420,
        height: 340,
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
        pluginRef: "",
        sampleSettings: makeSampleSettings(),
        muted: false,
        solo: false,
        volume: 1,
        pan: 0,
        inputMode: "steps",
        mixerInsertId: "insert-1",
      },
      {
        id: "ch-snare",
        name: "Snare",
        sampleRef: "",
        pluginRef: "",
        sampleSettings: makeSampleSettings(),
        muted: false,
        solo: false,
        volume: 1,
        pan: 0,
        inputMode: "steps",
        mixerInsertId: "insert-2",
      },
      {
        id: "ch-hat",
        name: "Hat",
        sampleRef: "",
        pluginRef: "",
        sampleSettings: makeSampleSettings(),
        muted: false,
        solo: false,
        volume: 1,
        pan: -0.15,
        inputMode: "piano",
        mixerInsertId: "insert-3",
      },
      {
        id: "ch-clap",
        name: "Clap",
        sampleRef: "",
        pluginRef: "",
        sampleSettings: makeSampleSettings(),
        muted: false,
        solo: false,
        volume: 1,
        pan: 0.08,
        inputMode: "steps",
        mixerInsertId: "insert-4",
      },
      {
        id: "ch-perc",
        name: "Perc",
        sampleRef: "",
        pluginRef: "",
        sampleSettings: makeSampleSettings(),
        muted: false,
        solo: false,
        volume: 1,
        pan: -0.08,
        inputMode: "steps",
        mixerInsertId: "insert-5",
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
          { id: "ch-clap" },
          { id: "ch-perc" },
        ],
      }),
    ],
    playlistTracks: makePlaylistTracks(10),
    playlistClips: [],
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
        meterSpectrum: makeInsertSpectrum(),
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
        meterSpectrum: makeInsertSpectrum(),
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
        meterSpectrum: makeInsertSpectrum(),
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
        meterSpectrum: makeInsertSpectrum(),
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
        meterSpectrum: makeInsertSpectrum(),
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
const LOAD_PROJECT_FROM_FILE_ACTION = "daw/loadProjectFromFile";
const nonUndoableActionTypes = new Set([
  "daw/setPlayheadStep",
  "daw/setInsertMeter",
  "daw/setPlaying",
  "daw/setRecording",
  "daw/setTransportMode",
  "daw/bringWindowToFront",
  LOAD_PROJECT_FROM_FILE_ACTION,
]);

function isObjectLike(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneSerializable(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

function sanitizeLoadedSampleSettings(raw) {
  const merged = {
    ...makeSampleSettings(),
    ...(isObjectLike(raw) ? raw : {}),
  };

  merged.stretchMode = SAMPLE_STRETCH_MODES.has(merged.stretchMode)
    ? merged.stretchMode
    : "resample";
  merged.stretchTimeMode = SAMPLE_STRETCH_TIME_MODES.has(merged.stretchTimeMode)
    ? merged.stretchTimeMode
    : "none";

  return merged;
}

function sanitizeLoadedDawState(currentState, rawLoadedState) {
  if (!isObjectLike(rawLoadedState)) {
    return null;
  }

  const loadedState = cloneSerializable(rawLoadedState);
  if (!isObjectLike(loadedState)) {
    return null;
  }

  const fallbackState =
    cloneSerializable(currentState) || cloneSerializable(initialState);
  if (!isObjectLike(fallbackState)) {
    return null;
  }

  const transportRaw = isObjectLike(loadedState.transport)
    ? loadedState.transport
    : {};
  const nextTransport = {
    ...fallbackState.transport,
    ...transportRaw,
  };

  nextTransport.bpm = Math.max(
    40,
    Math.min(300, Math.round(Number(nextTransport.bpm || 140))),
  );
  nextTransport.mode = nextTransport.mode === "song" ? "song" : "pattern";
  nextTransport.isPlaying = false;
  nextTransport.isRecording = false;
  nextTransport.currentStep16 = 0;

  const uiRaw = isObjectLike(loadedState.ui) ? loadedState.ui : {};
  const nextUi = {
    ...fallbackState.ui,
    ...uiRaw,
    windows: {
      ...fallbackState.ui.windows,
      ...(isObjectLike(uiRaw.windows) ? uiRaw.windows : {}),
    },
  };

  const projectRaw = isObjectLike(loadedState.project)
    ? loadedState.project
    : fallbackState.project;
  const nextProject = cloneSerializable(projectRaw);

  if (
    !isObjectLike(nextProject) ||
    !Array.isArray(nextProject.channels) ||
    !Array.isArray(nextProject.patterns)
  ) {
    return null;
  }

  nextProject.channels = nextProject.channels
    .map(function (channel, index) {
      if (!isObjectLike(channel)) {
        return null;
      }

      const safeId = String(channel.id || "ch-import-" + (index + 1)).trim();
      if (!safeId) {
        return null;
      }

      return {
        id: safeId,
        name: String(channel.name || "Channel " + (index + 1)).slice(0, 24),
        sampleRef: String(channel.sampleRef || "").trim(),
        pluginRef: String(channel.pluginRef || "").trim(),
        sampleSettings: sanitizeLoadedSampleSettings(channel.sampleSettings),
        muted: Boolean(channel.muted),
        solo: Boolean(channel.solo),
        volume: Math.max(0, Math.min(1, Number(channel.volume ?? 1))),
        pan: Math.max(-1, Math.min(1, Number(channel.pan ?? 0))),
        inputMode: channel.inputMode === "piano" ? "piano" : "steps",
        mixerInsertId: String(channel.mixerInsertId || "insert-1").trim(),
      };
    })
    .filter(Boolean);

  if (nextProject.channels.length === 0) {
    return null;
  }

  const channelIdSet = new Set(
    nextProject.channels.map(function (channel) {
      return channel.id;
    }),
  );

  nextProject.patterns = nextProject.patterns
    .map(function (pattern, index) {
      if (!isObjectLike(pattern)) {
        return null;
      }

      const lengthSteps = Math.max(
        4,
        Math.min(128, Math.round(Number(pattern.lengthSteps || 16))),
      );
      const safeId = String(pattern.id || "pat-import-" + (index + 1)).trim();
      if (!safeId) {
        return null;
      }

      const rawStepGrid = isObjectLike(pattern.stepGrid) ? pattern.stepGrid : {};
      const stepGrid = {};
      nextProject.channels.forEach(function (channel) {
        const rawRow = Array.isArray(rawStepGrid[channel.id])
          ? rawStepGrid[channel.id]
          : [];

        stepGrid[channel.id] = Array.from({ length: lengthSteps }).map(
          function (_, rowIndex) {
            return Boolean(rawRow[rowIndex]);
          },
        );
      });

      const rawPianoPreview = isObjectLike(pattern.pianoPreview)
        ? pattern.pianoPreview
        : {};
      const pianoPreview = {};

      nextProject.channels.forEach(function (channel) {
        const rawNotes = Array.isArray(rawPianoPreview[channel.id])
          ? rawPianoPreview[channel.id]
          : [];

        pianoPreview[channel.id] = rawNotes
          .map(function (note) {
            if (!isObjectLike(note)) {
              return null;
            }

            const start = Math.max(
              0,
              Math.min(lengthSteps - 0.0625, Number(note.start || 0)),
            );
            const maxLen = Math.max(0.0625, lengthSteps - start);
            const length = Math.max(
              0.0625,
              Math.min(maxLen, Number(note.length || 1)),
            );

            return {
              id:
                String(note.id || "").trim() ||
                makeMidiPatternNoteId("load"),
              start,
              length,
              pitch: Math.max(
                0,
                Math.min(127, Math.round(Number(note.pitch || DEFAULT_MIDI_PITCH))),
              ),
              velocity: Math.max(
                1,
                Math.min(127, Math.round(Number(note.velocity || 100))),
              ),
            };
          })
          .filter(Boolean)
          .sort(function (a, b) {
            if (a.start !== b.start) {
              return a.start - b.start;
            }

            return b.pitch - a.pitch;
          });
      });

      return {
        id: safeId,
        name: String(pattern.name || "Pattern " + (index + 1)).slice(0, 40),
        color: getSafePatternColor(pattern.color),
        lengthSteps,
        stepGrid,
        pianoPreview,
      };
    })
    .filter(Boolean);

  if (nextProject.patterns.length === 0) {
    return null;
  }

  nextProject.playlistTracks = Array.isArray(nextProject.playlistTracks)
    ? nextProject.playlistTracks
        .map(function (track, index) {
          if (!isObjectLike(track)) {
            return null;
          }

          const safeId = String(track.id || "trk-" + (index + 1)).trim();
          if (!safeId) {
            return null;
          }

          return {
            id: safeId,
            name: String(track.name || "Track " + (index + 1)).slice(0, 40),
          };
        })
        .filter(Boolean)
    : [];

  if (nextProject.playlistTracks.length === 0) {
    nextProject.playlistTracks = makePlaylistTracks(10);
  }

  const trackIdSet = new Set(
    nextProject.playlistTracks.map(function (track) {
      return track.id;
    }),
  );
  const patternIdSet = new Set(
    nextProject.patterns.map(function (pattern) {
      return pattern.id;
    }),
  );

  nextProject.playlistClips = Array.isArray(nextProject.playlistClips)
    ? nextProject.playlistClips
        .map(function (clip, index) {
          if (!isObjectLike(clip)) {
            return null;
          }

          const clipType =
            clip.clipType === "audio" || clip.clipType === "pattern"
              ? clip.clipType
              : "pattern";
          const trackId = String(clip.trackId || "").trim();
          if (!trackIdSet.has(trackId)) {
            return null;
          }

          const barStart = normalizeBarValue(clip.barStart || 1, 1, MAX_PLAYLIST_BARS);
          const barLength = normalizeBarValue(
            clip.barLength || 1,
            MIN_CLIP_BAR_LENGTH,
            64,
          );

          if (clipType === "pattern") {
            const patternId = String(clip.patternId || "").trim();
            if (!patternIdSet.has(patternId)) {
              return null;
            }

            return {
              id:
                String(clip.id || "").trim() ||
                "clip-load-" + (index + 1),
              clipType,
              patternId,
              trackId,
              barStart,
              barLength,
            };
          }

          const samplePath = String(clip.samplePath || "").trim();
          if (!samplePath) {
            return null;
          }

          const maybeChannelId = String(clip.channelId || "").trim();
          return {
            id:
              String(clip.id || "").trim() ||
              "clip-load-" + (index + 1),
            clipType,
            samplePath,
            audioName: String(clip.audioName || "Audio").trim() || "Audio",
            channelId: channelIdSet.has(maybeChannelId) ? maybeChannelId : undefined,
            trackId,
            barStart,
            barLength,
          };
        })
        .filter(Boolean)
    : [];

  nextProject.activePatternId = patternIdSet.has(nextProject.activePatternId)
    ? nextProject.activePatternId
    : nextProject.patterns[0].id;

  nextProject.activeChannelId = channelIdSet.has(nextProject.activeChannelId)
    ? nextProject.activeChannelId
    : nextProject.channels[0].id;

  const mixerRaw = isObjectLike(loadedState.mixer)
    ? loadedState.mixer
    : fallbackState.mixer;
  const nextMixer = cloneSerializable(mixerRaw);

  if (!isObjectLike(nextMixer) || !Array.isArray(nextMixer.inserts)) {
    return null;
  }

  nextMixer.inserts = nextMixer.inserts
    .map(function (insert, index) {
      if (!isObjectLike(insert)) {
        return null;
      }

      const rawId = String(insert.id || "").trim();
      const isMaster = insert.isMaster === true || rawId === "master";
      const safeId = isMaster
        ? "master"
        : rawId || "insert-" + (index + 1);

      const normalizedInsert = {
        ...insert,
        id: safeId,
        name: String(
          insert.name || (isMaster ? "Master" : "Insert " + (index + 1)),
        ).trim(),
        isMaster,
        active: isMaster ? true : Boolean(insert.active),
        pan: Math.max(-1, Math.min(1, Number(insert.pan || 0))),
        stereoSeparation: Math.max(
          -1,
          Math.min(1, Number(insert.stereoSeparation || 0)),
        ),
        fader: Math.max(0, Math.min(1.25, Number(insert.fader || 1))),
        meter: 0,
        meterSpectrum: makeInsertSpectrum(),
        routesTo: Array.isArray(insert.routesTo)
          ? insert.routesTo.map(function (routeId) {
              return String(routeId || "").trim();
            })
          : isMaster
            ? []
            : ["master"],
      };

      ensureInsertFxSlots(normalizedInsert);
      return normalizedInsert;
    })
    .filter(Boolean);

  if (nextMixer.inserts.length === 0) {
    return null;
  }

  const masterExists = nextMixer.inserts.some(function (insert) {
    return insert.isMaster || insert.id === "master";
  });

  if (!masterExists) {
    nextMixer.inserts.unshift({
      id: "master",
      name: "Master",
      isMaster: true,
      active: true,
      pan: 0,
      stereoSeparation: 0,
      fader: 1,
      meter: 0,
      meterSpectrum: makeInsertSpectrum(),
      routesTo: [],
      fxSlots: makeFxSlots(),
    });
  }

  const insertIdSet = new Set(
    nextMixer.inserts.map(function (insert) {
      return insert.id;
    }),
  );

  const firstNonMasterInsert =
    nextMixer.inserts.find(function (insert) {
      return !insert.isMaster;
    }) || nextMixer.inserts.find(function (insert) {
      return insert.id !== "master";
    });
  const fallbackInsertId = firstNonMasterInsert
    ? firstNonMasterInsert.id
    : "insert-1";

  nextProject.channels = nextProject.channels.map(function (channel) {
    const requestedInsertId = String(channel.mixerInsertId || "").trim();
    return {
      ...channel,
      mixerInsertId: insertIdSet.has(requestedInsertId)
        ? requestedInsertId
        : fallbackInsertId,
    };
  });

  if (!insertIdSet.has(nextMixer.selectedInsertId)) {
    nextMixer.selectedInsertId =
      fallbackInsertId === "insert-1" && insertIdSet.has("insert-1")
        ? "insert-1"
        : nextMixer.inserts[0].id;
  }

  return {
    transport: nextTransport,
    ui: nextUi,
    project: nextProject,
    mixer: nextMixer,
  };
}

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

function syncTransportModeWithWindow(state, windowId) {
  if (windowId === "channelRack") {
    state.transport.mode = "pattern";
    return;
  }

  if (windowId === "playlist") {
    state.transport.mode = "song";
  }
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

    loadProjectFromFile(state, action) {
      const sanitizedState = sanitizeLoadedDawState(state, action.payload);
      if (!sanitizedState) {
        return state;
      }

      return sanitizedState;
    },

    openWindow(state, action) {
      const windowId = String(action.payload || "");
      if (!windowId || !state.ui.windows[windowId]) {
        return;
      }

      state.ui.nextZ += 1;
      state.ui.windows[windowId].open = true;
      state.ui.windows[windowId].z = state.ui.nextZ;
      syncTransportModeWithWindow(state, windowId);
    },
    closeWindow(state, action) {
      state.ui.windows[action.payload].open = false;
    },
    bringWindowToFront(state, action) {
      const windowId = String(action.payload || "");
      if (!windowId || !state.ui.windows[windowId]) {
        return;
      }

      state.ui.nextZ += 1;
      state.ui.windows[windowId].z = state.ui.nextZ;
      syncTransportModeWithWindow(state, windowId);
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

    setPatternClipboard(state, action) {
      const requestedIds = Array.isArray(action.payload?.patternIds)
        ? action.payload.patternIds
        : [];

      const existingIdSet = new Set(
        state.project.patterns.map(function (pattern) {
          return pattern.id;
        }),
      );

      const sanitized = requestedIds
        .map(function (patternId) {
          return String(patternId || "").trim();
        })
        .filter(function (patternId, index, arr) {
          return Boolean(patternId) && arr.indexOf(patternId) === index;
        })
        .filter(function (patternId) {
          return existingIdSet.has(patternId);
        });

      state.ui.patternClipboardIds = sanitized;
    },

    setFxEditorTarget(state, action) {
      const insertId = String(action.payload?.insertId || "").trim();
      const slotId = String(action.payload?.slotId || "").trim();

      if (!insertId || !slotId) {
        return;
      }

      const insert = state.mixer.inserts.find(function (item) {
        return item.id === insertId;
      });
      if (!insert) {
        return;
      }

      const hasSlot = Array.isArray(insert.fxSlots)
        ? insert.fxSlots.some(function (slot) {
            return slot.id === slotId;
          })
        : false;

      if (!hasSlot) {
        return;
      }

      state.ui.fxEditorTarget = {
        insertId,
        slotId,
      };
      state.mixer.selectedInsertId = insertId;
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

      const nextPatternNumber = getNextPatternNumber(state.project.patterns);

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

    duplicatePatterns(state, action) {
      const requestedIdsRaw = Array.isArray(action.payload?.patternIds)
        ? action.payload.patternIds
        : [];
      const requestedIds = requestedIdsRaw
        .map(function (patternId) {
          return String(patternId || "").trim();
        })
        .filter(Boolean);

      if (requestedIds.length === 0) {
        requestedIds.push(String(state.project.activePatternId || "").trim());
      }

      const requestedIdSet = new Set(requestedIds);
      const sourcePatterns = state.project.patterns.filter(function (pattern) {
        return requestedIdSet.has(pattern.id);
      });

      if (sourcePatterns.length === 0) {
        return;
      }

      let nextPatternNumber = getNextPatternNumber(state.project.patterns);
      const duplicates = sourcePatterns.map(function (sourcePattern) {
        const nextId =
          "pat-" +
          Date.now().toString(36) +
          "-" +
          Math.random().toString(36).slice(2, 6);
        const duplicatedPattern = clonePatternForCopy(
          sourcePattern,
          nextId,
          "Pattern " + nextPatternNumber,
        );

        nextPatternNumber += 1;
        return duplicatedPattern;
      });

      state.project.patterns.push(...duplicates);
      state.project.activePatternId = duplicates[duplicates.length - 1].id;
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
      const patternId =
        action.payload.patternId || state.project.activePatternId;
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

      const barStart = normalizeBarValue(
        action.payload.barStart || 1,
        1,
        MAX_PLAYLIST_BARS,
      );

      const patternBarLength = Math.max(
        1,
        Math.ceil((pattern.lengthSteps || 16) / 16),
      );
      const barLength = normalizeBarValue(
        action.payload.barLength || patternBarLength,
        MIN_CLIP_BAR_LENGTH,
        64,
      );
      const newClipEnd = barStart + barLength;

      state.project.playlistClips = state.project.playlistClips.filter(
        function (clip) {
          if (clip.trackId !== trackId) {
            return true;
          }

          const start = normalizeBarValue(
            clip.barStart || 1,
            1,
            MAX_PLAYLIST_BARS,
          );
          const length = normalizeBarValue(
            clip.barLength || 1,
            MIN_CLIP_BAR_LENGTH,
            64,
          );
          const end = start + length;

          return end <= barStart || start >= newClipEnd;
        },
      );

      state.project.playlistClips.push({
        id:
          "clip-" +
          Date.now().toString(36) +
          "-" +
          Math.random().toString(36).slice(2, 6),
        clipType: "pattern",
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
          (trackOrderById[a.trackId] ?? 999) -
          (trackOrderById[b.trackId] ?? 999);
        if (trackDelta !== 0) {
          return trackDelta;
        }

        return a.barStart - b.barStart;
      });
    },

    addPlaylistAudioClip(state, action) {
      const trackId = action.payload.trackId;
      const hasTrack = state.project.playlistTracks.some(function (track) {
        return track.id === trackId;
      });
      if (!hasTrack) {
        return;
      }

      const samplePath = String(action.payload.samplePath || "").trim();
      if (!samplePath) {
        return;
      }

      const clipName =
        String(action.payload.clipName || "").trim() ||
        samplePath.split("/").pop() ||
        "Audio";

      const barStart = normalizeBarValue(
        action.payload.barStart || 1,
        1,
        MAX_PLAYLIST_BARS,
      );
      const barLength = normalizeBarValue(
        action.payload.barLength || 2,
        MIN_CLIP_BAR_LENGTH,
        64,
      );
      const newClipEnd = barStart + barLength;

      state.project.playlistClips = state.project.playlistClips.filter(
        function (clip) {
          if (clip.trackId !== trackId) {
            return true;
          }

          const start = normalizeBarValue(
            clip.barStart || 1,
            1,
            MAX_PLAYLIST_BARS,
          );
          const length = normalizeBarValue(
            clip.barLength || 1,
            MIN_CLIP_BAR_LENGTH,
            64,
          );
          const end = start + length;

          return end <= barStart || start >= newClipEnd;
        },
      );

      state.project.playlistClips.push({
        id:
          "clip-" +
          Date.now().toString(36) +
          "-" +
          Math.random().toString(36).slice(2, 6),
        clipType: "audio",
        samplePath,
        audioName: clipName,
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
          (trackOrderById[a.trackId] ?? 999) -
          (trackOrderById[b.trackId] ?? 999);
        if (trackDelta !== 0) {
          return trackDelta;
        }

        return a.barStart - b.barStart;
      });
    },

    addPlaylistSampleAsChannel(state, action) {
      const trackId = String(action.payload.trackId || "").trim();
      const hasTrack = state.project.playlistTracks.some(function (track) {
        return track.id === trackId;
      });
      if (!hasTrack) {
        return;
      }

      const sampleRef = String(action.payload.samplePath || "").trim();
      if (!sampleRef) {
        return;
      }

      const barStart = normalizeBarValue(
        action.payload.barStart || 1,
        1,
        MAX_PLAYLIST_BARS,
      );
      const barLength = normalizeBarValue(
        action.payload.barLength || 2,
        MIN_CLIP_BAR_LENGTH,
        64,
      );
      const newClipEnd = barStart + barLength;

      const rawSampleName =
        String(action.payload.clipName || "").trim() ||
        sampleRef.split("/").pop() ||
        "Sample";
      const decodedName = (function () {
        try {
          return decodeURIComponent(rawSampleName);
        } catch {
          return rawSampleName;
        }
      })();
      const channelName = decodedName.replace(/\.[^.]+$/, "").slice(0, 14);

      const newChannelId = makeChannelId();
      const preferredInsert = state.mixer.inserts.find(function (insert) {
        return insert.id === "insert-1";
      });
      const firstInsert = state.mixer.inserts.find(function (insert) {
        return !insert.isMaster;
      });

      state.project.channels.push({
        id: newChannelId,
        name: channelName || "Sample",
        sampleRef,
        pluginRef: "",
        sampleSettings: makeSampleSettings(),
        muted: false,
        solo: false,
        volume: 1,
        pan: 0,
        inputMode: "steps",
        mixerInsertId: preferredInsert?.id || firstInsert?.id || "insert-1",
      });

      state.project.patterns.forEach(function (pattern) {
        if (!pattern.stepGrid) {
          pattern.stepGrid = {};
        }

        const length = Math.max(1, pattern.lengthSteps || 16);
        pattern.stepGrid[newChannelId] = makeStepRow(length, []);
      });

      state.project.playlistClips = state.project.playlistClips.filter(
        function (clip) {
          if (clip.trackId !== trackId) {
            return true;
          }

          const start = normalizeBarValue(
            clip.barStart || 1,
            1,
            MAX_PLAYLIST_BARS,
          );
          const length = normalizeBarValue(
            clip.barLength || 1,
            MIN_CLIP_BAR_LENGTH,
            64,
          );
          const end = start + length;
          return end <= barStart || start >= newClipEnd;
        },
      );

      state.project.playlistClips.push({
        id:
          "clip-" +
          Date.now().toString(36) +
          "-" +
          Math.random().toString(36).slice(2, 6),
        clipType: "audio",
        samplePath: sampleRef,
        audioName: decodedName,
        channelId: newChannelId,
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
          (trackOrderById[a.trackId] ?? 999) -
          (trackOrderById[b.trackId] ?? 999);
        if (trackDelta !== 0) {
          return trackDelta;
        }

        return a.barStart - b.barStart;
      });

      state.project.activeChannelId = newChannelId;
    },

    addPlaylistTrack(state) {
      const nextTrackNumber =
        state.project.playlistTracks.reduce(function (maxNumber, track) {
          const fromId = String(track.id || "").match(/trk-(\d+)/i);
          const fromName = String(track.name || "").match(/track\s+(\d+)/i);
          const idNumber = fromId ? Number(fromId[1]) : 0;
          const nameNumber = fromName ? Number(fromName[1]) : 0;
          return Math.max(maxNumber, idNumber, nameNumber);
        }, 0) + 1;

      state.project.playlistTracks.push({
        id: "trk-" + nextTrackNumber,
        name: "Track " + nextTrackNumber,
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

      const currentStart = normalizeBarValue(
        clip.barStart || 1,
        1,
        MAX_PLAYLIST_BARS,
      );
      const maxLengthByTimeline = Math.max(
        MIN_CLIP_BAR_LENGTH,
        MAX_PLAYLIST_BARS - currentStart + 1,
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
      const maxStartByTimeline = Math.max(
        1,
        MAX_PLAYLIST_BARS - clipLength + 1,
      );
      const desiredStart = normalizeBarValue(
        action.payload.barStart || 1,
        1,
        maxStartByTimeline,
      );

      const clipsOnTargetTrack = state.project.playlistClips.filter(
        function (item) {
          return item.trackId === trackId && item.id !== clip.id;
        },
      );

      const isSlotFree = function (start) {
        const end = start + clipLength;

        return clipsOnTargetTrack.every(function (item) {
          const otherStart = normalizeBarValue(
            item.barStart || 1,
            1,
            MAX_PLAYLIST_BARS,
          );
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
          (trackOrderById[a.trackId] ?? 999) -
          (trackOrderById[b.trackId] ?? 999);
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

    addChannel(state) {
      const nextChannelNumber = state.project.channels.length + 1;
      const newChannelId = makeChannelId();
      const mixerTargets = state.mixer.inserts.filter(function (insert) {
        return !insert.isMaster;
      });
      const targetInsert =
        mixerTargets[Math.min(nextChannelNumber - 1, mixerTargets.length - 1)];

      state.project.channels.push({
        id: newChannelId,
        name: "Channel " + nextChannelNumber,
        sampleRef: "",
        pluginRef: "",
        sampleSettings: makeSampleSettings(),
        muted: false,
        solo: false,
        volume: 1,
        pan: 0,
        inputMode: "steps",
        mixerInsertId: targetInsert?.id || "insert-1",
      });

      state.project.patterns.forEach(function (pattern) {
        if (!pattern.stepGrid) {
          pattern.stepGrid = {};
        }

        const length = Math.max(1, pattern.lengthSteps || 16);
        pattern.stepGrid[newChannelId] = makeStepRow(length, []);
      });

      state.project.activeChannelId = newChannelId;
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

    pasteMidiPatternToChannel(state, action) {
      const pattern = state.project.patterns.find(function (item) {
        return item.id === action.payload.patternId;
      });
      if (!pattern) {
        return;
      }

      const channelId = String(action.payload.channelId || "").trim();
      if (!channelId) {
        return;
      }

      const channelExists = state.project.channels.some(function (channel) {
        return channel.id === channelId;
      });
      if (!channelExists) {
        return;
      }

      const incomingNotes = Array.isArray(action.payload.notes)
        ? action.payload.notes
        : [];
      if (incomingNotes.length === 0) {
        return;
      }

      const patternLength = Math.max(1, Number(pattern.lengthSteps || 16));

      if (!pattern.stepGrid) {
        pattern.stepGrid = {};
      }

      if (!Array.isArray(pattern.stepGrid[channelId])) {
        pattern.stepGrid[channelId] = makeStepRow(patternLength, []);
      }

      if (pattern.stepGrid[channelId].length < patternLength) {
        pattern.stepGrid[channelId].push(
          ...Array(patternLength - pattern.stepGrid[channelId].length).fill(
            false,
          ),
        );
      }

      if (!pattern.pianoPreview) {
        pattern.pianoPreview = {};
      }

      if (!Array.isArray(pattern.pianoPreview[channelId])) {
        pattern.pianoPreview[channelId] = [];
      }

      const stepRow = pattern.stepGrid[channelId];
      for (let i = 0; i < patternLength; i += 1) {
        stepRow[i] = false;
      }

      pattern.pianoPreview[channelId] = [];
      const pianoNotes = pattern.pianoPreview[channelId];

      const normalizedNotes = incomingNotes
        .map(function (note) {
          const start = Math.max(
            0,
            Math.min(patternLength - 0.0625, Number(note?.start || 0)),
          );
          const maxLen = Math.max(0.0625, patternLength - start);
          const length = Math.max(
            0.0625,
            Math.min(maxLen, Number(note?.length || 1)),
          );
          const pitch = Math.max(
            0,
            Math.min(127, Math.round(Number(note?.pitch || DEFAULT_MIDI_PITCH))),
          );
          const velocity = Math.max(
            1,
            Math.min(127, Math.round(Number(note?.velocity || 100))),
          );
          const source = String(note?.source || "piano").toLowerCase();

          return {
            start,
            length,
            pitch,
            velocity,
            source: source === "step" ? "step" : "piano",
          };
        })
        .filter(Boolean);

      if (normalizedNotes.length === 0) {
        return;
      }

      normalizedNotes.forEach(function (note) {
        const maxLen = Math.max(0.0625, patternLength - note.start);
        const shiftedLength = Math.max(0.0625, Math.min(maxLen, note.length));

        const isStepCandidate =
          note.source === "step" &&
          note.pitch === DEFAULT_MIDI_PITCH &&
          nearlyEqual(shiftedLength, 1) &&
          nearlyEqual(note.start, Math.round(note.start));

        if (isStepCandidate) {
          const stepIndex = Math.round(note.start);
          if (stepIndex >= 0 && stepIndex < patternLength) {
            stepRow[stepIndex] = true;
          }
          return;
        }

        pianoNotes.push({
          id: makeMidiPatternNoteId("midi"),
          start: note.start,
          length: shiftedLength,
          pitch: note.pitch,
          velocity: note.velocity,
        });
      });

      pianoNotes.sort(function (a, b) {
        if (a.start !== b.start) {
          return a.start - b.start;
        }
        return b.pitch - a.pitch;
      });
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

      if (Object.hasOwn(changes, "normalize")) {
        next.normalize = Boolean(changes.normalize);
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
          Math.min(95, Number(changes.fadeInPct ?? next.fadeInPct)),
        );
      }

      if (Object.hasOwn(changes, "fadeOutPct")) {
        next.fadeOutPct = Math.max(
          0,
          Math.min(95, Number(changes.fadeOutPct ?? next.fadeOutPct)),
        );
      }

      if (Object.hasOwn(changes, "envEnabled")) {
        next.envEnabled = Boolean(changes.envEnabled);
      }

      if (Object.hasOwn(changes, "envDelayMs")) {
        next.envDelayMs = Math.max(
          0,
          Math.min(3000, Number(changes.envDelayMs ?? next.envDelayMs ?? 0)),
        );
      }

      if (Object.hasOwn(changes, "envAttackMs")) {
        next.envAttackMs = Math.max(
          0,
          Math.min(3000, Number(changes.envAttackMs ?? next.envAttackMs ?? 0)),
        );
      }

      if (Object.hasOwn(changes, "envHoldMs")) {
        next.envHoldMs = Math.max(
          0,
          Math.min(3000, Number(changes.envHoldMs ?? next.envHoldMs ?? 0)),
        );
      }

      if (Object.hasOwn(changes, "envDecayMs")) {
        next.envDecayMs = Math.max(
          0,
          Math.min(3000, Number(changes.envDecayMs ?? next.envDecayMs ?? 0)),
        );
      }

      if (Object.hasOwn(changes, "envSustainPct")) {
        next.envSustainPct = Math.max(
          0,
          Math.min(
            100,
            Number(changes.envSustainPct ?? next.envSustainPct ?? 100),
          ),
        );
      }

      if (Object.hasOwn(changes, "envReleaseMs")) {
        next.envReleaseMs = Math.max(
          0,
          Math.min(
            3000,
            Number(changes.envReleaseMs ?? next.envReleaseMs ?? 0),
          ),
        );
      }

      if (Object.hasOwn(changes, "attackMs")) {
        next.attackMs = Math.max(
          0,
          Math.min(400, Number(changes.attackMs ?? next.attackMs ?? 8)),
        );
      }

      if (Object.hasOwn(changes, "releaseMs")) {
        next.releaseMs = Math.max(
          0,
          Math.min(1000, Number(changes.releaseMs ?? next.releaseMs ?? 420)),
        );
      }

      if (
        Object.hasOwn(changes, "pitchCents") ||
        Object.hasOwn(changes, "pitchSemitones")
      ) {
        const rawPitchCents = Object.hasOwn(changes, "pitchCents")
          ? Number(changes.pitchCents)
          : Number(changes.pitchSemitones) * 100;

        next.pitchCents = Math.max(
          -100,
          Math.min(100, Math.round(rawPitchCents ?? next.pitchCents ?? 0)),
        );
      }

      if (Object.hasOwn(changes, "monoMode")) {
        next.monoMode = Boolean(changes.monoMode);
      }

      if (Object.hasOwn(changes, "stretchMode")) {
        const requestedMode = String(changes.stretchMode || "")
          .trim()
          .toLowerCase();
        next.stretchMode = SAMPLE_STRETCH_MODES.has(requestedMode)
          ? requestedMode
          : next.stretchMode || "resample";
      }

      if (Object.hasOwn(changes, "stretchPitchSemitones")) {
        next.stretchPitchSemitones = Math.max(
          -24,
          Math.min(
            24,
            Number(
              changes.stretchPitchSemitones ?? next.stretchPitchSemitones ?? 0,
            ),
          ),
        );
      }

      if (Object.hasOwn(changes, "stretchMultiplier")) {
        next.stretchMultiplier = Math.max(
          0.25,
          Math.min(
            8,
            Number(changes.stretchMultiplier ?? next.stretchMultiplier ?? 1),
          ),
        );
      }

      if (Object.hasOwn(changes, "stretchSourceBpm")) {
        next.stretchSourceBpm = Math.max(
          20,
          Math.min(
            300,
            Number(changes.stretchSourceBpm ?? next.stretchSourceBpm ?? 120),
          ),
        );
      }

      if (Object.hasOwn(changes, "stretchProjectTempoBpm")) {
        next.stretchProjectTempoBpm = Math.max(
          20,
          Math.min(
            300,
            Number(
              changes.stretchProjectTempoBpm ??
                next.stretchProjectTempoBpm ??
                120,
            ),
          ),
        );
      }

      if (Object.hasOwn(changes, "stretchTimeMode")) {
        const requestedMode = String(changes.stretchTimeMode || "")
          .trim()
          .toLowerCase();
        next.stretchTimeMode = SAMPLE_STRETCH_TIME_MODES.has(requestedMode)
          ? requestedMode
          : next.stretchTimeMode || "none";
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
      channel.pluginRef = "";
      const sourceName = action.payload.sampleName || action.payload.sampleRef;
      channel.name = sourceName
        .split("/")
        .pop()
        .replace(/\.[^.]+$/, "")
        .slice(0, 14);
    },

    assignPluginToChannel(state, action) {
      const channel = state.project.channels.find(function (item) {
        return item.id === action.payload.channelId;
      });
      if (!channel) {
        return;
      }

      channel.pluginRef = String(action.payload.pluginRef || "").trim();
      channel.sampleRef = "";

      const pluginName = String(action.payload.pluginName || "Plugin").trim();
      if (pluginName) {
        channel.name = pluginName.slice(0, 14);
      }
    },

    selectInsert(state, action) {
      state.mixer.selectedInsertId = action.payload;
    },

    addMixerTrack(state) {
      const nextInsertNumber =
        state.mixer.inserts.reduce(function (maxValue, insert) {
          const match = String(insert.id || "").match(/insert-(\d+)/i);
          if (!match) {
            return maxValue;
          }

          return Math.max(maxValue, Number(match[1] || 0));
        }, 0) + 1;

      const newInsertId = "insert-" + nextInsertNumber;

      state.mixer.inserts.push({
        id: newInsertId,
        name: "Insert " + nextInsertNumber,
        isMaster: false,
        active: true,
        pan: 0,
        stereoSeparation: 0,
        fader: 1,
        meter: 0,
        meterSpectrum: makeInsertSpectrum(),
        routesTo: ["master"],
        fxSlots: makeFxSlots(),
      });

      state.mixer.selectedInsertId = newInsertId;
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

      ensureInsertFxSlots(insert);

      const slot = insert.fxSlots.find(function (item) {
        return item.id === action.payload.slotId;
      });
      if (!slot) {
        return;
      }

      if (slot.effectType === FX_SLOT_EFFECT_NONE) {
        slot.enabled = false;
        return;
      }

      slot.enabled = !slot.enabled;
    },

    setFxSlotEffectType(state, action) {
      const insert = state.mixer.inserts.find(function (item) {
        return item.id === action.payload.insertId;
      });
      if (!insert) {
        return;
      }

      ensureInsertFxSlots(insert);

      const slotIndex = insert.fxSlots.findIndex(function (item) {
        return item.id === action.payload.slotId;
      });
      if (slotIndex < 0) {
        return;
      }

      const slot = insert.fxSlots[slotIndex];
      const requestedType = String(action.payload.effectType || "")
        .trim()
        .toLowerCase();

      if (requestedType === FX_SLOT_EFFECT_GRAPHIC_EQ) {
        slot.effectType = FX_SLOT_EFFECT_GRAPHIC_EQ;
        slot.name = "Graphic EQ";
        slot.params = getSafeGraphicEqParams(slot.params);
        return;
      }

      if (requestedType === FX_SLOT_EFFECT_REVERB) {
        slot.effectType = FX_SLOT_EFFECT_REVERB;
        slot.name = "Reverb";
        slot.params = getSafeReverbParams(slot.params);
        return;
      }

      slot.effectType = FX_SLOT_EFFECT_NONE;
      slot.enabled = false;
      slot.name = getFxSlotDefaultName(slotIndex);
      slot.params = null;
    },

    setFxSlotGraphicEqBandGain(state, action) {
      const insert = state.mixer.inserts.find(function (item) {
        return item.id === action.payload.insertId;
      });
      if (!insert) {
        return;
      }

      ensureInsertFxSlots(insert);

      const slot = insert.fxSlots.find(function (item) {
        return item.id === action.payload.slotId;
      });
      if (!slot || slot.effectType !== FX_SLOT_EFFECT_GRAPHIC_EQ) {
        return;
      }

      slot.params = getSafeGraphicEqParams(slot.params);
      const bandIndex = Math.max(
        0,
        Math.min(
          GRAPHIC_EQ_DEFAULT_POINT_FREQUENCIES.length - 1,
          Number(action.payload.bandIndex || 0),
        ),
      );
      slot.params.points[bandIndex].gainDb = clampEqBandGainDb(
        action.payload.gainDb,
      );
    },

    setFxSlotGraphicEqLowCut(state, action) {
      const insert = state.mixer.inserts.find(function (item) {
        return item.id === action.payload.insertId;
      });
      if (!insert) {
        return;
      }

      ensureInsertFxSlots(insert);

      const slot = insert.fxSlots.find(function (item) {
        return item.id === action.payload.slotId;
      });
      if (!slot || slot.effectType !== FX_SLOT_EFFECT_GRAPHIC_EQ) {
        return;
      }

      slot.params = getSafeGraphicEqParams(slot.params);
      const pointIndex = 0;
      slot.params.points[pointIndex].frequencyHz = clampEqFrequencyHz(
        action.payload.frequencyHz,
      );
    },

    setFxSlotGraphicEqPoint(state, action) {
      const insert = state.mixer.inserts.find(function (item) {
        return item.id === action.payload.insertId;
      });
      if (!insert) {
        return;
      }

      ensureInsertFxSlots(insert);

      const slot = insert.fxSlots.find(function (item) {
        return item.id === action.payload.slotId;
      });
      if (!slot || slot.effectType !== FX_SLOT_EFFECT_GRAPHIC_EQ) {
        return;
      }

      slot.params = getSafeGraphicEqParams(slot.params);

      const pointIndex = Math.max(
        0,
        Math.min(
          GRAPHIC_EQ_DEFAULT_POINT_FREQUENCIES.length - 1,
          Number(action.payload.pointIndex || 0),
        ),
      );

      const point = slot.params.points[pointIndex];
      point.frequencyHz = clampEqFrequencyHz(
        action.payload.frequencyHz ?? point.frequencyHz,
      );
      point.gainDb = clampEqBandGainDb(action.payload.gainDb ?? point.gainDb);
      point.q = clampEqQ(action.payload.q ?? point.q);

      if (Object.hasOwn(action.payload, "bandType")) {
        point.bandType = sanitizeEqBandType(
          action.payload.bandType,
          point.bandType,
        );
      }
    },

    setFxSlotReverbParam(state, action) {
      const insert = state.mixer.inserts.find(function (item) {
        return item.id === action.payload.insertId;
      });
      if (!insert) {
        return;
      }

      ensureInsertFxSlots(insert);

      const slot = insert.fxSlots.find(function (item) {
        return item.id === action.payload.slotId;
      });
      if (!slot || slot.effectType !== FX_SLOT_EFFECT_REVERB) {
        return;
      }

      slot.params = getSafeReverbParams(slot.params);

      const param = String(action.payload.param || "").trim();
      const value = action.payload.value;

      if (param === "freeze") {
        slot.params.freeze = Boolean(value);
        return;
      }

      if (param === "decayTime") {
        slot.params.decayTime = clampReverbInRange(value, 0.2, 20, 2.8);
        return;
      }

      if (param === "preDelayMs") {
        slot.params.preDelayMs = clampReverbInRange(value, 0, 250, 24);
        return;
      }

      if (param === "hiCutHz") {
        slot.params.hiCutHz = clampReverbInRange(value, 1200, 18000, 9000);
        return;
      }

      if (param === "loCutHz") {
        slot.params.loCutHz = clampReverbInRange(value, 20, 1200, 130);
        return;
      }

      if (param === "modulationRateHz") {
        slot.params.modulationRateHz = clampReverbInRange(value, 0, 8, 0.35);
        return;
      }

      if (
        param === "size" ||
        param === "damping" ||
        param === "earlyReflections" ||
        param === "diffusion" ||
        param === "modulationDepth" ||
        param === "width" ||
        param === "dryWet"
      ) {
        slot.params[param] = clampReverb01(value, slot.params[param]);
      }
    },

    setInsertMeter(state, action) {
      const insert = state.mixer.inserts.find(function (item) {
        return item.id === action.payload.insertId;
      });
      if (!insert) {
        return;
      }
      insert.meter = Math.max(0, Math.min(1, action.payload.meter));

      if (Array.isArray(action.payload.spectrum)) {
        const nextSpectrum = action.payload.spectrum
          .slice(0, 256)
          .map(function (value) {
            const numeric = Number(value || 0);
            return Math.max(0, Math.min(1, numeric));
          });

        if (nextSpectrum.length > 0) {
          insert.meterSpectrum = nextSpectrum;
        }
      } else if (!Array.isArray(insert.meterSpectrum)) {
        insert.meterSpectrum = makeInsertSpectrum();
      }
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

  if (action.type === LOAD_PROJECT_FROM_FILE_ACTION) {
    const loadedState = dawSlice.reducer(state, action);
    if (loadedState !== state) {
      undoPastStates.length = 0;
      undoFutureStates.length = 0;
    }

    return loadedState;
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
  loadProjectFromFile,
  openWindow,
  closeWindow,
  bringWindowToFront,
  setWindowRect,
  toggleWindowMaximize,
  setBrowserTab,
  setPatternClipboard,
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
  setActiveChannel,
  addChannel,
  togglePianoNote,
  setPianoNoteLength,
  movePianoNote,
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
  setInsertMeter,
} = dawSlice.actions;

export { undoLastChange };

export const store = configureStore({
  reducer: {
    daw: dawReducerWithUndo,
  },
});
