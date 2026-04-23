import {
  FX_SLOT_EFFECT_GRAPHIC_EQ,
  FX_SLOT_EFFECT_MAXIMIZER,
  FX_SLOT_EFFECT_NONE,
  FX_SLOT_EFFECT_REVERB,
  GRAPHIC_EQ_BAND_TYPES,
  GRAPHIC_EQ_DEFAULT_POINT_FREQUENCIES,
  MAXIMIZER_MODES,
  UI_THEMES,
  UI_THEME_DEFAULT,
  DEFAULT_MIDI_PITCH,
  DEFAULT_NOTE_VELOCITY,
  DEFAULT_INSERT_SPECTRUM_BINS,
  MAX_PLAYLIST_BARS,
  MIN_CLIP_BAR_LENGTH,
  DEFAULT_PATTERN_COLOR,
  SAMPLE_STRETCH_MODES,
  SAMPLE_STRETCH_TIME_MODES,
} from "./constants";

// ------------------------------------------------------------------
// UI / Theme
// ------------------------------------------------------------------

export function sanitizeUiTheme(rawTheme) {
  const requested = String(rawTheme || "")
    .trim()
    .toLowerCase();

  if (UI_THEMES.has(requested)) {
    return requested;
  }

  return UI_THEME_DEFAULT;
}

// ------------------------------------------------------------------
// Graphic EQ helpers
// ------------------------------------------------------------------

export function getDefaultEqBandType(index) {
  if (index === 0) {
    return "lowshelf";
  }

  if (index === GRAPHIC_EQ_DEFAULT_POINT_FREQUENCIES.length - 1) {
    return "highshelf";
  }

  return "peaking";
}

export function sanitizeEqBandType(raw, fallback) {
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

export function clampEqBandGainDb(raw) {
  const value = Number(raw || 0);
  return Math.max(-18, Math.min(18, value));
}

export function clampEqFrequencyHz(raw) {
  const value = Number(raw || 20);
  return Math.max(20, Math.min(20000, value));
}

export function clampEqQ(raw) {
  const value = Number(raw || 1.2);
  return Math.max(0.25, Math.min(8, value));
}

export function makeGraphicEqParams() {
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

export function getSafeGraphicEqParams(raw) {
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

// ------------------------------------------------------------------
// Reverb helpers
// ------------------------------------------------------------------

export function clampReverb01(raw, fallback) {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, value));
}

export function clampReverbInRange(raw, min, max, fallback) {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, value));
}

export function makeReverbParams() {
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

export function getSafeReverbParams(raw) {
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

// ------------------------------------------------------------------
// Maximizer helpers
// ------------------------------------------------------------------

export function sanitizeMaximizerMode(rawMode) {
  const requested = String(rawMode || "")
    .trim()
    .toLowerCase();
  if (MAXIMIZER_MODES.includes(requested)) {
    return requested;
  }
  return "irc-ii";
}

export function clampMaximizerThresholdDb(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(-24, Math.min(0, value));
}

export function clampMaximizerCeilingDb(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return -1;
  }
  return Math.max(-18, Math.min(0, value));
}

export function clampMaximizerCharacter(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return 0.5;
  }
  return Math.max(0, Math.min(1, value));
}

export function makeMaximizerParams() {
  return {
    mode: "irc-ii",
    truePeakEnabled: true,
    thresholdDb: 0,
    ceilingDb: -1,
    character: 0.5,
  };
}

export function getSafeMaximizerParams(raw) {
  const legacyThreshold = Number(raw?.thresholdDb);
  const legacyCeiling = Number(raw?.ceilingDb);
  const legacyCharacter = Number(raw?.character);
  const legacyMode = sanitizeMaximizerMode(raw?.mode);
  const isLegacyDefault =
    Number.isFinite(legacyThreshold) &&
    Number.isFinite(legacyCeiling) &&
    Number.isFinite(legacyCharacter) &&
    Math.abs(legacyThreshold + 6) < 0.001 &&
    Math.abs(legacyCeiling + 0.1) < 0.001 &&
    Math.abs(legacyCharacter - 0.58) < 0.001 &&
    legacyMode === "irc-ii" &&
    Boolean(raw?.truePeakEnabled ?? true);

  const base = {
    ...makeMaximizerParams(),
    ...(raw || {}),
  };

  if (isLegacyDefault) {
    base.thresholdDb = 0;
    base.ceilingDb = -1;
    base.character = 0.5;
  }

  return {
    mode: sanitizeMaximizerMode(base.mode),
    truePeakEnabled: Boolean(base.truePeakEnabled),
    thresholdDb: clampMaximizerThresholdDb(base.thresholdDb),
    ceilingDb: clampMaximizerCeilingDb(base.ceilingDb),
    character: clampMaximizerCharacter(base.character),
  };
}

// ------------------------------------------------------------------
// Insert / mixer helpers
// ------------------------------------------------------------------

export function makeInsertSpectrum() {
  return Array.from({ length: DEFAULT_INSERT_SPECTRUM_BINS }).map(function () {
    return 0;
  });
}

export function makeInsertWaveform() {
  return Array.from({ length: 220 }).map(function () {
    return 0;
  });
}

export function makeMaximizerStereoMeter() {
  return {
    leftVolumeDb: -96,
    leftReductionDb: 0,
    rightReductionDb: 0,
    rightVolumeDb: -96,
  };
}

export function getFxSlotDefaultName(index) {
  return "Slot " + (index + 1);
}

export function normalizeFxSlot(slot, index) {
  const rawEffectType = String(slot?.effectType || "")
    .trim()
    .toLowerCase();
  const effectType =
    rawEffectType === FX_SLOT_EFFECT_GRAPHIC_EQ
      ? FX_SLOT_EFFECT_GRAPHIC_EQ
      : rawEffectType === FX_SLOT_EFFECT_REVERB
        ? FX_SLOT_EFFECT_REVERB
        : rawEffectType === FX_SLOT_EFFECT_MAXIMIZER
          ? FX_SLOT_EFFECT_MAXIMIZER
          : FX_SLOT_EFFECT_NONE;
  const defaultName =
    effectType === FX_SLOT_EFFECT_GRAPHIC_EQ
      ? "Graphic EQ"
      : effectType === FX_SLOT_EFFECT_REVERB
        ? "Reverb"
        : effectType === FX_SLOT_EFFECT_MAXIMIZER
          ? "Limiter"
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
          : effectType === FX_SLOT_EFFECT_MAXIMIZER
            ? getSafeMaximizerParams(slot?.params)
            : null,
  };
}

export function ensureInsertFxSlots(insert) {
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

export function makeFxSlots() {
  return Array.from({ length: 10 }).map(function (_, index) {
    return {
      id: "slot-" + (index + 1),
      name: getFxSlotDefaultName(index),
      enabled: false,
      effectType: FX_SLOT_EFFECT_NONE,
      params: null,
    };
  });
}

// ------------------------------------------------------------------
// Sample / channel helpers
// ------------------------------------------------------------------

export function makeSampleSettings() {
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
}

export function sanitizeLoadedSampleSettings(raw) {
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

// ------------------------------------------------------------------
// Pattern / project helpers
// ------------------------------------------------------------------

export function nearlyEqual(a, b) {
  return Math.abs(a - b) <= 0.0001;
}

export function makeStepRow(length, activeIndexes) {
  const row = Array(length).fill(false);
  activeIndexes.forEach(function (index) {
    if (index >= 0 && index < length) {
      row[index] = true;
    }
  });
  return row;
}

export function makePlaylistTracks(count) {
  return Array.from({ length: count }).map(function (_, index) {
    const number = index + 1;
    return {
      id: "trk-" + number,
      name: "Track " + number,
    };
  });
}

export function makePatternStepGrid(channels, lengthSteps) {
  return channels.reduce(function (acc, channel) {
    acc[channel.id] = makeStepRow(lengthSteps, []);
    return acc;
  }, {});
}

export function makeChannelId() {
  return (
    "ch-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 6)
  );
}

export function makeMidiPatternNoteId(prefix) {
  return (
    prefix +
    "-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 7)
  );
}

export function normalizeBarValue(raw, minValue, maxValue) {
  const normalized = Math.round(Number(raw || 0) * 16) / 16;
  return Math.max(minValue, Math.min(maxValue, normalized));
}

export function getSafePatternColor(color) {
  const normalized = String(color || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    return normalized.toLowerCase();
  }

  return DEFAULT_PATTERN_COLOR;
}

export function makeEmptyPattern(options) {
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

export function getNextPatternNumber(patterns) {
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

export function clonePatternForCopy(sourcePattern, nextId, nextName) {
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
        velocity: Math.max(
          1,
          Math.min(
            127,
            Math.round(Number(note.velocity || DEFAULT_NOTE_VELOCITY)),
          ),
        ),
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

// ------------------------------------------------------------------
// Serialization / loading helpers
// ------------------------------------------------------------------

export function isObjectLike(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function cloneSerializable(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------
// Note: sanitizeLoadedDawState was extracted to loadState.js to avoid a
// circular dependency between utils -> initialState -> utils.
// ------------------------------------------------------------------
