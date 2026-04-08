import { useCallback, useEffect, useRef } from "react";
import Soundfont from "soundfont-player";
import { useDispatch, useSelector } from "react-redux";
import { getPluginInstrument } from "../data/pluginInstruments";
import { setInsertMeter, setPlayheadStep, setPlaying } from "../store";
import { toSafeSampleUrl } from "../utils/sampleUrl";
import { createWsolaStretchedBufferFromSample } from "./wsolaStretch";

const defaultSampleSettings = {
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
  stretchMode: "resample",
  stretchPitchSemitones: 0,
  stretchMultiplier: 1,
  stretchSourceBpm: 120,
  stretchProjectTempoBpm: 120,
  stretchTimeMode: "none",
};

const DEFAULT_SAMPLE_MIDI_PITCH = 72;
const DEFAULT_NOTE_VELOCITY = 95;
const PLUGIN_INSTRUMENT_GAIN_BOOST = 1.5;
const BASE_CHANNEL_TRIGGER_GAIN = 0.75;
const MIXER_METER_RMS_GAIN = 4.2;
const MIXER_METER_PEAK_GAIN = 1.9;
const MIXER_METER_NOISE_GATE = 0.0016;
const MIXER_METER_RESPONSE_CURVE = 0.5;
const MIXER_METER_DECAY = 0.9;
const EQ_SPECTRUM_BINS = 112;
const EQ_SPECTRUM_MIN_FREQ = 20;
const EQ_SPECTRUM_MAX_FREQ = 20000;
const FX_EFFECT_GRAPHIC_EQ = "graphic-eq";
const FX_EFFECT_REVERB = "reverb";
const FX_EFFECT_MAXIMIZER = "maximizer";
const GRAPHIC_EQ_DEFAULT_POINT_FREQUENCIES = [
  50, 100, 250, 500, 1000, 3000, 8000,
];
const DRUMKIT_PREVIEW_EVENT = "openstudio:drumkit-preview";
const SAMPLE_SETTINGS_PREVIEW_PLAY_EVENT =
  "openstudio:sample-settings-preview-play";
const SAMPLE_SETTINGS_PREVIEW_STOP_EVENT =
  "openstudio:sample-settings-preview-stop";
const MIN_AUDIO_GAIN = 0.0001;
const CUT_ITSELF_RELEASE_SEC = 0.01;
const CUT_ITSELF_STOP_PADDING_SEC = 0.003;
const GRAPHIC_EQ_BAND_TYPES = [
  "peaking",
  "lowshelf",
  "highshelf",
  "lowpass",
  "highpass",
];
const MAXIMIZER_MODES = ["irc-ll", "irc-i", "irc-ii", "irc-iii", "irc-iv"];

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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function scheduleSmoothGainStop(param, atTime, releaseSec) {
  const safeReleaseSec = Math.max(0.003, Number(releaseSec || 0));
  const stopAt = atTime + safeReleaseSec;
  const tau = Math.max(0.001, safeReleaseSec * 0.25);

  if (typeof param.cancelAndHoldAtTime === "function") {
    param.cancelAndHoldAtTime(atTime);
    const heldGain = Math.max(MIN_AUDIO_GAIN, Number(param.value || 0));
    param.setValueAtTime(heldGain, atTime);
  } else {
    const nowGain = Math.max(MIN_AUDIO_GAIN, Number(param.value || 0));
    param.cancelScheduledValues(atTime);
    param.setValueAtTime(nowGain, atTime);
  }

  param.setTargetAtTime(MIN_AUDIO_GAIN, atTime, tau);
  return stopAt;
}

function getSafeGraphicEqParams(raw) {
  const requestedPoints = Array.isArray(raw?.points) ? raw.points : [];
  const legacyBands = Array.isArray(raw?.bands) ? raw.bands : [];
  return {
    points: GRAPHIC_EQ_DEFAULT_POINT_FREQUENCIES.map(
      function (defaultFreq, index) {
        const requestedPoint = requestedPoints[index];
        const legacyGain = legacyBands[index];
        return {
          frequencyHz: clamp(
            Number(requestedPoint?.frequencyHz || defaultFreq),
            20,
            20000,
          ),
          gainDb: clamp(
            Number(
              requestedPoint?.gainDb ??
                (Number.isFinite(legacyGain) ? legacyGain : 0),
            ),
            -18,
            18,
          ),
          q: clamp(Number(requestedPoint?.q || 1.2), 0.25, 8),
          bandType: sanitizeEqBandType(
            requestedPoint?.bandType,
            getDefaultEqBandType(index),
          ),
        };
      },
    ),
  };
}

function getSafeReverbParams(raw) {
  const base = {
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
    ...(raw || {}),
  };

  return {
    decayTime: clamp(Number(base.decayTime ?? 2.8), 0.2, 20),
    preDelayMs: clamp(Number(base.preDelayMs ?? 24), 0, 250),
    size: clamp(Number(base.size ?? 0.62), 0, 1),
    damping: clamp(Number(base.damping ?? 0.45), 0, 1),
    hiCutHz: clamp(Number(base.hiCutHz ?? 9000), 1200, 18000),
    loCutHz: clamp(Number(base.loCutHz ?? 130), 20, 1200),
    earlyReflections: clamp(Number(base.earlyReflections ?? 0.38), 0, 1),
    diffusion: clamp(Number(base.diffusion ?? 0.72), 0, 1),
    modulationDepth: clamp(Number(base.modulationDepth ?? 0.22), 0, 1),
    modulationRateHz: clamp(Number(base.modulationRateHz ?? 0.35), 0, 8),
    width: clamp(Number(base.width ?? 0.9), 0, 1),
    dryWet: clamp(Number(base.dryWet ?? 0.34), 0, 1),
    freeze: Boolean(base.freeze),
  };
}

function sanitizeMaximizerMode(rawMode) {
  const requested = String(rawMode || "")
    .trim()
    .toLowerCase();
  if (MAXIMIZER_MODES.includes(requested)) {
    return requested;
  }
  return "irc-ii";
}

function getSafeMaximizerParams(raw) {
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
    mode: "irc-ii",
    truePeakEnabled: true,
    thresholdDb: 0,
    ceilingDb: -1,
    character: 0.5,
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
    thresholdDb: clamp(Number(base.thresholdDb ?? 0), -24, 0),
    ceilingDb: clamp(Number(base.ceilingDb ?? -1), -18, 0),
    character: clamp(Number(base.character ?? 0.5), 0, 1),
  };
}

function buildSoftClipCurve(strength) {
  const safeStrength = clamp(Number(strength || 0), 0, 1);
  const samples = 4096;
  const curve = new Float32Array(samples);
  const drive = 1 + safeStrength * 6;

  for (let index = 0; index < samples; index += 1) {
    const x = (index / (samples - 1)) * 2 - 1;
    curve[index] = Math.tanh(x * drive) / Math.tanh(drive);
  }

  return curve;
}

function getActiveFxState(insert) {
  const fxSlots = Array.isArray(insert?.fxSlots) ? insert.fxSlots : [];
  const state = {
    eqEnabled: false,
    eqParams: getSafeGraphicEqParams(null),
    reverbEnabled: false,
    reverbParams: getSafeReverbParams(null),
    maximizerEnabled: false,
    maximizerParams: getSafeMaximizerParams(null),
  };

  fxSlots.forEach(function (slot) {
    if (!slot?.enabled) {
      return;
    }

    const effectType = String(slot.effectType || "none");
    if (effectType === FX_EFFECT_GRAPHIC_EQ) {
      state.eqEnabled = true;
      state.eqParams = getSafeGraphicEqParams(slot.params);
      return;
    }

    if (effectType === FX_EFFECT_REVERB) {
      state.reverbEnabled = true;
      state.reverbParams = getSafeReverbParams(slot.params);
      return;
    }

    if (effectType === FX_EFFECT_MAXIMIZER) {
      state.maximizerEnabled = true;
      state.maximizerParams = getSafeMaximizerParams(slot.params);
    }
  });

  return state;
}

function midiPitchToPlaybackRate(midiPitch) {
  const semitoneOffset = midiPitch - DEFAULT_SAMPLE_MIDI_PITCH;
  const rawRate = Math.pow(2, semitoneOffset / 12);
  return Math.max(0.125, Math.min(8, rawRate));
}

function applyVolumeEnvelopeToGain(
  gainParam,
  startTime,
  gateDuration,
  settings,
) {
  const minGain = 0.0001;
  const envDelay = Math.max(0, Number(settings.envDelayMs ?? 0) / 1000);
  const envAttack = Math.max(0, Number(settings.envAttackMs ?? 0) / 1000);
  const envHold = Math.max(0, Number(settings.envHoldMs ?? 0) / 1000);
  const envDecay = Math.max(0, Number(settings.envDecayMs ?? 0) / 1000);
  const envRelease = Math.max(0, Number(settings.envReleaseMs ?? 0) / 1000);
  const envSustain = Math.max(
    minGain,
    Math.min(1, Number(settings.envSustainPct ?? 100) / 100),
  );

  const noteOffTime = startTime + Math.max(0.001, Number(gateDuration || 0));

  let cursor = startTime;

  gainParam.cancelScheduledValues(startTime);
  gainParam.setValueAtTime(minGain, startTime);

  const advanceWithHold = function (seconds, value) {
    const endTime = Math.min(noteOffTime, cursor + Math.max(0, seconds));
    gainParam.setValueAtTime(value, endTime);
    cursor = endTime;
  };

  const advanceWithRamp = function (seconds, targetValue) {
    const endTime = Math.min(noteOffTime, cursor + Math.max(0, seconds));
    if (endTime <= cursor) {
      gainParam.setValueAtTime(targetValue, cursor);
      return;
    }

    if (seconds > 0.0005) {
      gainParam.linearRampToValueAtTime(targetValue, endTime);
    } else {
      gainParam.setValueAtTime(targetValue, endTime);
    }

    cursor = endTime;
  };

  if (envDelay > 0) {
    advanceWithHold(envDelay, minGain);
  }

  if (cursor < noteOffTime) {
    advanceWithRamp(envAttack, 1);
  }

  if (cursor < noteOffTime) {
    advanceWithHold(envHold, 1);
  }

  if (cursor < noteOffTime) {
    advanceWithRamp(envDecay, envSustain);
  }

  gainParam.setValueAtTime(envSustain, noteOffTime);

  if (envRelease > 0.0005) {
    gainParam.linearRampToValueAtTime(minGain, noteOffTime + envRelease);
  } else {
    gainParam.setValueAtTime(minGain, noteOffTime);
  }
}

function getSafeSampleSettings(raw) {
  const hasPitchCents = Object.hasOwn(raw || {}, "pitchCents");
  const base = {
    ...defaultSampleSettings,
    attackMs: 8,
    releaseMs: 420,
    pitchCents: hasPitchCents
      ? Number(raw.pitchCents)
      : Number(raw?.pitchSemitones || 0) * 100,
    monoMode: false,
    ...(raw || {}),
  };

  const next = {
    cutItself: Boolean(base.cutItself),
    normalize: Boolean(base.normalize),
    lengthPct: Math.max(5, Math.min(100, Number(base.lengthPct ?? 100))),
    fadeInPct: Math.max(0, Math.min(95, Number(base.fadeInPct ?? 0))),
    fadeOutPct: Math.max(0, Math.min(95, Number(base.fadeOutPct ?? 0))),
    envEnabled: Boolean(base.envEnabled),
    envDelayMs: Math.max(0, Math.min(3000, Number(base.envDelayMs ?? 0))),
    envAttackMs: Math.max(0, Math.min(3000, Number(base.envAttackMs ?? 0))),
    envHoldMs: Math.max(0, Math.min(3000, Number(base.envHoldMs ?? 0))),
    envDecayMs: Math.max(0, Math.min(3000, Number(base.envDecayMs ?? 0))),
    envSustainPct: Math.max(
      0,
      Math.min(100, Number(base.envSustainPct ?? 100)),
    ),
    envReleaseMs: Math.max(0, Math.min(3000, Number(base.envReleaseMs ?? 0))),
    attackMs: Math.max(0, Math.min(400, Number(base.attackMs ?? 8))),
    releaseMs: Math.max(0, Math.min(1000, Number(base.releaseMs ?? 420))),
    pitchCents: Math.max(
      -100,
      Math.min(100, Math.round(Number(base.pitchCents ?? 0))),
    ),
    monoMode: Boolean(base.monoMode),
    stretchMode: ["none", "resample", "stretch", "realtime"].includes(
      String(base.stretchMode || "")
        .trim()
        .toLowerCase(),
    )
      ? String(base.stretchMode || "none")
          .trim()
          .toLowerCase()
      : "none",
    stretchPitchSemitones: Math.max(
      -24,
      Math.min(24, Number(base.stretchPitchSemitones ?? 0)),
    ),
    stretchMultiplier: Math.max(
      0.25,
      Math.min(8, Number(base.stretchMultiplier ?? 1)),
    ),
    stretchSourceBpm: Math.max(
      20,
      Math.min(300, Number(base.stretchSourceBpm ?? 120)),
    ),
    stretchProjectTempoBpm: Math.max(
      20,
      Math.min(300, Number(base.stretchProjectTempoBpm ?? 120)),
    ),
    stretchTimeMode: [
      "none",
      "set-bpm",
      "project-tempo",
      "beat-1",
      "beat-2",
      "bar-1",
      "bar-2",
      "bar-3",
      "bar-4",
    ].includes(
      String(base.stretchTimeMode || "")
        .trim()
        .toLowerCase(),
    )
      ? String(base.stretchTimeMode || "none")
          .trim()
          .toLowerCase()
      : "none",
  };

  const fadeTotal = next.fadeInPct + next.fadeOutPct;
  if (fadeTotal > 98) {
    const scale = 98 / fadeTotal;
    next.fadeInPct = Math.max(0, Math.round(next.fadeInPct * scale));
    next.fadeOutPct = Math.max(0, Math.round(next.fadeOutPct * scale));
  }

  return next;
}

function getStretchTargetDurationSeconds(settings, sampleReadDuration, bpm) {
  const safeDuration = Math.max(0.01, Number(sampleReadDuration || 0.01));
  const safeBpm = Math.max(1, Number(bpm || 120));
  const quarterSec = 60 / safeBpm;
  const timeMode = String(settings.stretchTimeMode || "none")
    .trim()
    .toLowerCase();
  const mul = Math.max(
    0.25,
    Math.min(8, Number(settings.stretchMultiplier || 1)),
  );

  if (timeMode === "set-bpm") {
    const sourceBpm = Math.max(
      20,
      Math.min(300, Number(settings.stretchSourceBpm || 120)),
    );
    return Math.max(0.01, safeDuration * (sourceBpm / safeBpm) * mul);
  }

  if (timeMode === "project-tempo") {
    const projectLockBpm = Math.max(
      20,
      Math.min(300, Number(settings.stretchProjectTempoBpm || safeBpm)),
    );
    return Math.max(0.01, safeDuration * (projectLockBpm / safeBpm) * mul);
  }

  if (timeMode === "beat-1") {
    return quarterSec * mul;
  }
  if (timeMode === "beat-2") {
    return quarterSec * 2 * mul;
  }
  if (timeMode === "bar-1") {
    return quarterSec * 4 * mul;
  }
  if (timeMode === "bar-2") {
    return quarterSec * 8 * mul;
  }
  if (timeMode === "bar-3") {
    return quarterSec * 12 * mul;
  }
  if (timeMode === "bar-4") {
    return quarterSec * 16 * mul;
  }

  return Math.max(0.01, safeDuration * mul);
}

function getTimeStretchProfile(settings, sampleReadDuration, bpm, baseRate) {
  const stretchMode = String(settings.stretchMode || "none")
    .trim()
    .toLowerCase();
  const safeBaseRate = Math.max(0.125, Math.min(8, Number(baseRate || 1)));
  const targetDurationSec = getStretchTargetDurationSeconds(
    settings,
    sampleReadDuration,
    bpm,
  );

  if (stretchMode === "none") {
    return {
      playbackRate: safeBaseRate,
      targetDurationSec: Math.max(0.01, sampleReadDuration / safeBaseRate),
      useGranularStretch: false,
    };
  }

  const pitchShiftSemitones = Math.max(
    -24,
    Math.min(24, Number(settings.stretchPitchSemitones || 0)),
  );
  const pitchShiftRate = Math.pow(2, pitchShiftSemitones / 12);

  if (stretchMode === "stretch") {
    return {
      // In stretch mode keep duration target independent from pitch changes.
      playbackRate: Math.max(0.125, Math.min(8, safeBaseRate * pitchShiftRate)),
      targetDurationSec: Math.max(0.01, targetDurationSec),
      useGranularStretch: true,
    };
  }

  const durationRate = Math.max(
    0.125,
    Math.min(8, sampleReadDuration / targetDurationSec),
  );

  return {
    playbackRate: Math.max(
      0.125,
      Math.min(8, safeBaseRate * pitchShiftRate * durationRate),
    ),
    targetDurationSec: Math.max(0.01, sampleReadDuration / durationRate),
    useGranularStretch: false,
  };
}

const hannWindowCache = new Map();

function getHannWindowCurve(samples) {
  const size = Math.max(16, Math.min(2048, Math.round(Number(samples) || 256)));
  const cached = hannWindowCache.get(size);
  if (cached) {
    return cached;
  }

  const curve = new Float32Array(size);
  for (let i = 0; i < size; i += 1) {
    const phase = size > 1 ? i / (size - 1) : 0;
    curve[i] = Math.max(0, Math.sin(Math.PI * phase));
  }

  hannWindowCache.set(size, curve);
  return curve;
}

function findBestWsolaOffsetSamples(
  channelData,
  predictedOffset,
  referenceOffset,
  windowSamples,
  searchRadiusSamples,
  maxOffsetSamples,
) {
  if (!channelData || channelData.length <= 1) {
    return Math.max(0, Math.min(maxOffsetSamples, predictedOffset));
  }

  const safeMax = Math.max(
    0,
    Math.min(maxOffsetSamples, channelData.length - 2),
  );
  const safeWindow = Math.max(32, Math.min(windowSamples, 1024));
  const halfWindow = Math.max(16, Math.floor(safeWindow / 2));
  const safeRef = Math.max(0, Math.min(safeMax, referenceOffset));
  const searchMin = Math.max(
    0,
    Math.min(safeMax, predictedOffset - searchRadiusSamples),
  );
  const searchMax = Math.max(
    0,
    Math.min(safeMax, predictedOffset + searchRadiusSamples),
  );

  let bestOffset = Math.max(searchMin, Math.min(searchMax, predictedOffset));
  let bestScore = -Infinity;

  for (let candidate = searchMin; candidate <= searchMax; candidate += 1) {
    let dot = 0;
    let energyA = 0;
    let energyB = 0;

    for (let i = 0; i < safeWindow; i += 1) {
      const centerShift = i - halfWindow;
      const refIndex = safeRef + centerShift;
      const candIndex = candidate + centerShift;

      if (
        refIndex < 0 ||
        candIndex < 0 ||
        refIndex >= channelData.length ||
        candIndex >= channelData.length
      ) {
        continue;
      }

      const a = channelData[refIndex];
      const b = channelData[candIndex];
      dot += a * b;
      energyA += a * a;
      energyB += b * b;
    }

    const denom = Math.sqrt(energyA * energyB) + 1e-9;
    const score = dot / denom;
    if (score > bestScore) {
      bestScore = score;
      bestOffset = candidate;
    }
  }

  return bestOffset;
}

function areMixerSettingsEqual(prev, next) {
  if (prev === next) {
    return true;
  }
  if (!prev || !next || prev.length !== next.length) {
    return false;
  }

  for (let i = 0; i < prev.length; i += 1) {
    const a = prev[i];
    const b = next[i];
    if (!a || !b) {
      return false;
    }

    if (
      a.id !== b.id ||
      a.isMaster !== b.isMaster ||
      a.active !== b.active ||
      a.pan !== b.pan ||
      a.stereoSeparation !== b.stereoSeparation ||
      a.fader !== b.fader
    ) {
      return false;
    }

    const aSlots = a.fxSlots || [];
    const bSlots = b.fxSlots || [];
    if (aSlots.length !== bSlots.length) {
      return false;
    }

    for (let slotIndex = 0; slotIndex < aSlots.length; slotIndex += 1) {
      const aSlot = aSlots[slotIndex];
      const bSlot = bSlots[slotIndex];
      if (!aSlot || !bSlot) {
        return false;
      }

      if (
        aSlot.id !== bSlot.id ||
        aSlot.enabled !== bSlot.enabled ||
        aSlot.effectType !== bSlot.effectType
      ) {
        return false;
      }

      const aParams = aSlot.params || {};
      const bParams = bSlot.params || {};
      if (aSlot.effectType === FX_EFFECT_GRAPHIC_EQ) {
        const aPoints = aParams.points || [];
        const bPoints = bParams.points || [];
        if (aPoints.length !== bPoints.length) {
          return false;
        }

        for (let pointIndex = 0; pointIndex < aPoints.length; pointIndex += 1) {
          const aPoint = aPoints[pointIndex] || {};
          const bPoint = bPoints[pointIndex] || {};
          if (
            aPoint.frequencyHz !== bPoint.frequencyHz ||
            aPoint.gainDb !== bPoint.gainDb ||
            aPoint.q !== bPoint.q ||
            aPoint.bandType !== bPoint.bandType
          ) {
            return false;
          }
        }
      }

      if (aSlot.effectType === FX_EFFECT_REVERB) {
        if (
          aParams.decayTime !== bParams.decayTime ||
          aParams.preDelayMs !== bParams.preDelayMs ||
          aParams.size !== bParams.size ||
          aParams.damping !== bParams.damping ||
          aParams.hiCutHz !== bParams.hiCutHz ||
          aParams.loCutHz !== bParams.loCutHz ||
          aParams.earlyReflections !== bParams.earlyReflections ||
          aParams.diffusion !== bParams.diffusion ||
          aParams.modulationDepth !== bParams.modulationDepth ||
          aParams.modulationRateHz !== bParams.modulationRateHz ||
          aParams.width !== bParams.width ||
          aParams.dryWet !== bParams.dryWet ||
          aParams.freeze !== bParams.freeze
        ) {
          return false;
        }
      }

      if (aSlot.effectType === FX_EFFECT_MAXIMIZER) {
        if (
          aParams.mode !== bParams.mode ||
          aParams.truePeakEnabled !== bParams.truePeakEnabled ||
          aParams.thresholdDb !== bParams.thresholdDb ||
          aParams.ceilingDb !== bParams.ceilingDb ||
          aParams.character !== bParams.character
        ) {
          return false;
        }
      }
    }

    const aRoutes = a.routesTo || [];
    const bRoutes = b.routesTo || [];
    if (aRoutes.length !== bRoutes.length) {
      return false;
    }

    for (let r = 0; r < aRoutes.length; r += 1) {
      if (aRoutes[r] !== bRoutes[r]) {
        return false;
      }
    }
  }

  return true;
}

function toMixerGraphSignature(settings) {
  return settings
    .map(function (insert) {
      const routes = Array.isArray(insert.routesTo)
        ? insert.routesTo.join(",")
        : "";
      return insert.id + ":" + routes + ":" + (insert.isMaster ? "m" : "i");
    })
    .join("|");
}

function getPluginInstrumentCacheKey(pluginRef, channelId) {
  const safePluginRef = String(pluginRef || "").trim();
  const safeChannelId = String(channelId || "").trim();
  if (!safeChannelId) {
    return safePluginRef;
  }

  return safePluginRef + "::" + safeChannelId;
}

function routeInstrumentOutputToNode(instrument, destinationNode) {
  if (!instrument || !destinationNode) {
    return;
  }

  const candidateNodes = [instrument, instrument.output].filter(Boolean);
  for (let index = 0; index < candidateNodes.length; index += 1) {
    const node = candidateNodes[index];
    if (
      typeof node.connect !== "function" ||
      typeof node.disconnect !== "function"
    ) {
      continue;
    }

    try {
      node.disconnect();
      node.connect(destinationNode);
      return;
    } catch {
      continue;
    }
  }
}

function safeDisconnect(node) {
  if (!node) {
    return;
  }

  try {
    node.disconnect();
  } catch {
    return;
  }
}

function buildEqSpectrumFromAnalyserData(analyser, frequencyData) {
  if (!analyser || !frequencyData || frequencyData.length === 0) {
    return null;
  }

  const nyquist = Math.max(1, analyser.context.sampleRate * 0.5);
  const maxSourceIndex = frequencyData.length - 1;

  const rawBins = Array.from({ length: EQ_SPECTRUM_BINS }).map(
    function (_, index) {
      const t = EQ_SPECTRUM_BINS > 1 ? index / (EQ_SPECTRUM_BINS - 1) : 0;
      const targetFrequency =
        EQ_SPECTRUM_MIN_FREQ *
        Math.pow(EQ_SPECTRUM_MAX_FREQ / EQ_SPECTRUM_MIN_FREQ, t);
      const sourcePosition = Math.max(
        0,
        Math.min(maxSourceIndex, (targetFrequency / nyquist) * maxSourceIndex),
      );

      const baseIndex = Math.floor(sourcePosition);
      const blend = sourcePosition - baseIndex;

      const left = frequencyData[baseIndex] || 0;
      const right = frequencyData[Math.min(maxSourceIndex, baseIndex + 1)] || 0;
      const interpolated = left + (right - left) * blend;

      const averagingRadius =
        targetFrequency < 200 ? 3 : targetFrequency < 1200 ? 2 : 1;
      let weightedSum = 0;
      let weightTotal = 0;
      for (
        let offset = -averagingRadius;
        offset <= averagingRadius;
        offset += 1
      ) {
        const sampleIndex = Math.max(
          0,
          Math.min(maxSourceIndex, baseIndex + offset),
        );
        const sampleValue = frequencyData[sampleIndex] || 0;
        const weight = averagingRadius + 1 - Math.abs(offset);
        weightedSum += sampleValue * weight;
        weightTotal += weight;
      }

      const averaged =
        weightTotal > 0 ? weightedSum / weightTotal : interpolated;
      const combined = interpolated * 0.65 + averaged * 0.35;

      const normalized = clamp(combined / 255, 0, 1);
      return Math.pow(normalized, 1.03);
    },
  );

  // Mild temporal smoothing between neighboring visual bins for a cleaner fill.
  const smoothedBins = rawBins.map(function (value, index) {
    const prev = rawBins[Math.max(0, index - 1)] || value;
    const next = rawBins[Math.min(rawBins.length - 1, index + 1)] || value;
    return clamp(value * 0.58 + prev * 0.21 + next * 0.21, 0, 1);
  });

  return smoothedBins;
}

export function useAudioScheduler() {
  const dispatch = useDispatch();
  const transport = useSelector(function (state) {
    return state.daw.transport;
  });
  const channels = useSelector(function (state) {
    return state.daw.project.channels;
  });
  const activePatternId = useSelector(function (state) {
    return state.daw.project.activePatternId;
  });
  const activePattern = useSelector(function (state) {
    return state.daw.project.patterns.find(function (item) {
      return item.id === activePatternId;
    });
  });
  const patterns = useSelector(function (state) {
    return state.daw.project.patterns;
  });
  const playlistClips = useSelector(function (state) {
    return state.daw.project.playlistClips;
  });
  const mixerSettings = useSelector(function (state) {
    return state.daw.mixer.inserts.map(function (insert) {
      return {
        id: insert.id,
        isMaster: Boolean(insert.isMaster),
        active: Boolean(insert.active),
        pan: Number(insert.pan || 0),
        stereoSeparation: Number(insert.stereoSeparation || 0),
        fader: Number(insert.fader || 0),
        routesTo: Array.isArray(insert.routesTo) ? insert.routesTo.slice() : [],
        fxSlots: (Array.isArray(insert.fxSlots) ? insert.fxSlots : []).map(
          function (slot) {
            const effectType = String(slot.effectType || "none");
            return {
              id: slot.id,
              enabled: Boolean(slot.enabled),
              effectType,
              params:
                effectType === FX_EFFECT_GRAPHIC_EQ
                  ? getSafeGraphicEqParams(slot.params)
                  : effectType === FX_EFFECT_REVERB
                    ? getSafeReverbParams(slot.params)
                    : effectType === FX_EFFECT_MAXIMIZER
                      ? getSafeMaximizerParams(slot.params)
                    : null,
            };
          },
        ),
      };
    });
  }, areMixerSettingsEqual);
  const selectedInsertId = useSelector(function (state) {
    return state.daw.mixer.selectedInsertId;
  });
  const fxEditorTarget = useSelector(function (state) {
    return state.daw.ui.fxEditorTarget;
  });

  const audioCtxRef = useRef(null);
  const rafIdRef = useRef(null);
  const nextNoteTimeRef = useRef(0);
  const stepRef = useRef(0);
  const startedAtRef = useRef(0);
  const sampleBufferCacheRef = useRef(new Map());
  const sampleLoadPromiseRef = useRef(new Map());
  const sampleLoadFailedRef = useRef(new Set());
  const sampleNormalizeGainRef = useRef(new WeakMap());
  const stretchedSampleBufferCacheRef = useRef(new WeakMap());
  const activeSampleVoicesRef = useRef(new Map());
  const activeSynthVoicesRef = useRef(new Map());
  const pluginInstrumentRef = useRef(new Map());
  const pluginInstrumentLoadRef = useRef(new Map());
  const pluginInstrumentFailedRef = useRef(new Set());
  const drumkitPreviewVoiceRef = useRef(null);
  const drumkitPreviewMeterRafRef = useRef(null);
  const sampleSettingsPreviewMeterRafRef = useRef(null);
  const sampleSettingsPreviewMeterInsertIdRef = useRef(null);
  const channelsRef = useRef(channels);
  const activePatternRef = useRef(activePattern);
  const patternsRef = useRef(patterns);
  const playlistClipsRef = useRef(playlistClips);
  const transportModeRef = useRef(transport.mode);
  const songLoopEnabledRef = useRef(Boolean(transport.songLoopEnabled));
  const scheduledAudioClipStartRef = useRef(new Map());
  const mixerSettingsRef = useRef(mixerSettings);
  const mixerGraphRef = useRef(null);
  const lastMeterDispatchAtRef = useRef(0);
  const lastMeterLevelsRef = useRef(new Map());
  const lastMeterSpectrumRef = useRef(new Map());
  const lastMeterWaveformRef = useRef(new Map());
  const lastMaximizerReductionRef = useRef(new Map());
  const lastMaximizerOutputDbRef = useRef(new Map());
  const lastMaximizerStereoMeterRef = useRef(new Map());
  const maximizerTraceHistoryRef = useRef(new Map());
  const lastMaximizerVisualKeyRef = useRef(new Map());
  const stopVisualTailUntilRef = useRef(0);
  const stopVisualTailStartedAtRef = useRef(0);
  const stopVisualTailStateRef = useRef(new Map());
  const spectrumTargetInsertIdRef = useRef(
    String(fxEditorTarget?.insertId || selectedInsertId || ""),
  );

  useEffect(
    function () {
      spectrumTargetInsertIdRef.current = String(
        fxEditorTarget?.insertId || selectedInsertId || "",
      );
    },
    [fxEditorTarget?.insertId, selectedInsertId],
  );

  const ensureContext = useCallback(function () {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  }, []);

  const loadPluginInstrument = useCallback(
    async function (pluginRef, channelId, destinationNode) {
      const plugin = getPluginInstrument(pluginRef);
      if (!plugin || !plugin.soundfont) {
        return null;
      }

      const key = getPluginInstrumentCacheKey(plugin.pluginRef, channelId);
      const cached = pluginInstrumentRef.current.get(key);
      if (cached) {
        routeInstrumentOutputToNode(cached, destinationNode);
        return cached;
      }

      const pending = pluginInstrumentLoadRef.current.get(key);
      if (pending) {
        return pending;
      }

      if (pluginInstrumentFailedRef.current.has(key)) {
        return null;
      }

      const audioCtx = ensureContext();
      const defaultDestination = destinationNode || audioCtx.destination;
      const request = Soundfont.instrument(audioCtx, plugin.soundfont, {
        destination: defaultDestination,
      })
        .then(function (instrument) {
          routeInstrumentOutputToNode(instrument, destinationNode);
          pluginInstrumentRef.current.set(key, instrument);
          pluginInstrumentFailedRef.current.delete(key);
          return instrument;
        })
        .catch(function () {
          pluginInstrumentFailedRef.current.add(key);
          return null;
        })
        .finally(function () {
          pluginInstrumentLoadRef.current.delete(key);
        });

      pluginInstrumentLoadRef.current.set(key, request);
      return request;
    },
    [ensureContext],
  );

  const loadSampleBuffer = useCallback(
    async function (sampleRef) {
      const sampleUrl = toSafeSampleUrl(sampleRef);
      if (!sampleUrl) {
        return null;
      }

      const cached = sampleBufferCacheRef.current.get(sampleUrl);
      if (cached) {
        return cached;
      }

      const pending = sampleLoadPromiseRef.current.get(sampleUrl);
      if (pending) {
        return pending;
      }

      const request = (async function () {
        const audioCtx = ensureContext();
        const response = await fetch(sampleUrl);
        if (!response.ok) {
          throw new Error("Sample request failed");
        }

        const data = await response.arrayBuffer();
        const decodedBuffer = await audioCtx.decodeAudioData(data.slice(0));

        sampleBufferCacheRef.current.set(sampleUrl, decodedBuffer);
        sampleLoadFailedRef.current.delete(sampleUrl);
        return decodedBuffer;
      })();

      sampleLoadPromiseRef.current.set(sampleUrl, request);

      try {
        return await request;
      } catch {
        sampleLoadFailedRef.current.add(sampleUrl);
        return null;
      } finally {
        sampleLoadPromiseRef.current.delete(sampleUrl);
      }
    },
    [ensureContext],
  );

  const ensureMixerGraph = useCallback(
    function () {
      const audioCtx = ensureContext();
      const settings = mixerSettingsRef.current || [];
      const signature = toMixerGraphSignature(settings);

      if (
        mixerGraphRef.current &&
        mixerGraphRef.current.signature === signature
      ) {
        return mixerGraphRef.current;
      }

      if (mixerGraphRef.current) {
        mixerGraphRef.current.inserts.forEach(function (node) {
          safeDisconnect(node.inputGain);
          safeDisconnect(node.splitter);
          safeDisconnect(node.leftToLeft);
          safeDisconnect(node.rightToLeft);
          safeDisconnect(node.leftToRight);
          safeDisconnect(node.rightToRight);
          safeDisconnect(node.merger);
          safeDisconnect(node.panner);
          safeDisconnect(node.fxDryGain);
          safeDisconnect(node.fxWetGain);
          safeDisconnect(node.eqInput);
          safeDisconnect(node.eqLowCut);
          if (Array.isArray(node.eqBands)) {
            node.eqBands.forEach(function (band) {
              safeDisconnect(band);
            });
          }
          safeDisconnect(node.reverbInput);
          safeDisconnect(node.reverbPreDelay);
          safeDisconnect(node.reverbLoCut);
          safeDisconnect(node.reverbHiCut);
          safeDisconnect(node.reverbEarlyGain);
          safeDisconnect(node.reverbLateInput);
          safeDisconnect(node.reverbLateLeftDelay);
          safeDisconnect(node.reverbLateRightDelay);
          safeDisconnect(node.reverbLeftFeedback);
          safeDisconnect(node.reverbRightFeedback);
          safeDisconnect(node.reverbLeftDamping);
          safeDisconnect(node.reverbRightDamping);
          safeDisconnect(node.reverbWidthSplitter);
          safeDisconnect(node.reverbLeftToLeft);
          safeDisconnect(node.reverbRightToLeft);
          safeDisconnect(node.reverbLeftToRight);
          safeDisconnect(node.reverbRightToRight);
          safeDisconnect(node.reverbWidthMerger);
          if (Array.isArray(node.reverbEarlyTaps)) {
            node.reverbEarlyTaps.forEach(function (tap) {
              safeDisconnect(tap.delay);
              safeDisconnect(tap.gain);
            });
          }
          if (Array.isArray(node.reverbModulators)) {
            node.reverbModulators.forEach(function (mod) {
              safeDisconnect(mod.lfo);
              safeDisconnect(mod.depth);
            });
          }
          safeDisconnect(node.reverbWetGain);
          safeDisconnect(node.maximizerInput);
          safeDisconnect(node.maximizerPreGain);
          safeDisconnect(node.maximizerPreAnalyser);
          safeDisconnect(node.maximizerCompressor);
          safeDisconnect(node.maximizerSoftClip);
          safeDisconnect(node.maximizerPostAnalyser);
          safeDisconnect(node.maximizerPreSplit);
          safeDisconnect(node.maximizerPostSplit);
          safeDisconnect(node.maximizerOutSplit);
          safeDisconnect(node.maximizerPreLeftAnalyser);
          safeDisconnect(node.maximizerPreRightAnalyser);
          safeDisconnect(node.maximizerPostLeftAnalyser);
          safeDisconnect(node.maximizerPostRightAnalyser);
          safeDisconnect(node.maximizerOutLeftAnalyser);
          safeDisconnect(node.maximizerOutRightAnalyser);
          safeDisconnect(node.maximizerCeilingGain);
          safeDisconnect(node.maximizerAnalyser);
          safeDisconnect(node.outputGain);
          safeDisconnect(node.analyser);
        });
      }

      const inserts = new Map();

      settings.forEach(function (insert) {
        const inputGain = audioCtx.createGain();
        const splitter = audioCtx.createChannelSplitter(2);
        const leftToLeft = audioCtx.createGain();
        const rightToLeft = audioCtx.createGain();
        const leftToRight = audioCtx.createGain();
        const rightToRight = audioCtx.createGain();
        const merger = audioCtx.createChannelMerger(2);
        const panner = audioCtx.createStereoPanner();
        const fxDryGain = audioCtx.createGain();
        const fxWetGain = audioCtx.createGain();
        const eqInput = audioCtx.createGain();
        const eqLowCut = audioCtx.createBiquadFilter();
        const eqBands = GRAPHIC_EQ_DEFAULT_POINT_FREQUENCIES.map(
          function (frequencyHz, index) {
            const band = audioCtx.createBiquadFilter();
            band.type = getDefaultEqBandType(index);
            band.frequency.value = frequencyHz;
            band.Q.value = 1.08;
            band.gain.value = 0;
            return band;
          },
        );
        const reverbInput = audioCtx.createGain();
        const reverbPreDelay = audioCtx.createDelay(0.5);
        const reverbLoCut = audioCtx.createBiquadFilter();
        const reverbHiCut = audioCtx.createBiquadFilter();
        const reverbEarlyGain = audioCtx.createGain();
        const reverbLateInput = audioCtx.createGain();
        const reverbLateLeftDelay = audioCtx.createDelay(1.25);
        const reverbLateRightDelay = audioCtx.createDelay(1.25);
        const reverbLeftFeedback = audioCtx.createGain();
        const reverbRightFeedback = audioCtx.createGain();
        const reverbLeftDamping = audioCtx.createBiquadFilter();
        const reverbRightDamping = audioCtx.createBiquadFilter();
        const reverbLeftToLeft = audioCtx.createGain();
        const reverbRightToLeft = audioCtx.createGain();
        const reverbLeftToRight = audioCtx.createGain();
        const reverbRightToRight = audioCtx.createGain();
        const reverbWidthMerger = audioCtx.createChannelMerger(2);
        const reverbWetGain = audioCtx.createGain();
        const maximizerInput = audioCtx.createGain();
        const maximizerPreGain = audioCtx.createGain();
        const maximizerPreAnalyser = audioCtx.createAnalyser();
        const maximizerCompressor = audioCtx.createDynamicsCompressor();
        const maximizerSoftClip = audioCtx.createWaveShaper();
        const maximizerPostAnalyser = audioCtx.createAnalyser();
        const maximizerPreSplit = audioCtx.createChannelSplitter(2);
        const maximizerPostSplit = audioCtx.createChannelSplitter(2);
        const maximizerOutSplit = audioCtx.createChannelSplitter(2);
        const maximizerPreLeftAnalyser = audioCtx.createAnalyser();
        const maximizerPreRightAnalyser = audioCtx.createAnalyser();
        const maximizerPostLeftAnalyser = audioCtx.createAnalyser();
        const maximizerPostRightAnalyser = audioCtx.createAnalyser();
        const maximizerOutLeftAnalyser = audioCtx.createAnalyser();
        const maximizerOutRightAnalyser = audioCtx.createAnalyser();
        const maximizerCeilingGain = audioCtx.createGain();
        const maximizerAnalyser = audioCtx.createAnalyser();
        const outputGain = audioCtx.createGain();
        const analyser = audioCtx.createAnalyser();

        analyser.fftSize = 2048;
        analyser.minDecibels = -96;
        analyser.maxDecibels = -12;
        analyser.smoothingTimeConstant = 0.58;
        maximizerAnalyser.fftSize = 1024;
        maximizerAnalyser.minDecibels = -96;
        maximizerAnalyser.maxDecibels = -12;
        maximizerAnalyser.smoothingTimeConstant = 0.35;
        maximizerPreAnalyser.fftSize = 1024;
        maximizerPreAnalyser.minDecibels = -96;
        maximizerPreAnalyser.maxDecibels = -12;
        maximizerPreAnalyser.smoothingTimeConstant = 0.25;
        maximizerPostAnalyser.fftSize = 1024;
        maximizerPostAnalyser.minDecibels = -96;
        maximizerPostAnalyser.maxDecibels = -12;
        maximizerPostAnalyser.smoothingTimeConstant = 0.25;
        [
          maximizerPreLeftAnalyser,
          maximizerPreRightAnalyser,
          maximizerPostLeftAnalyser,
          maximizerPostRightAnalyser,
          maximizerOutLeftAnalyser,
          maximizerOutRightAnalyser,
        ].forEach(function (nodeRef) {
          nodeRef.fftSize = 1024;
          nodeRef.minDecibels = -96;
          nodeRef.maxDecibels = -12;
          nodeRef.smoothingTimeConstant = 0.22;
        });

        inputGain.connect(splitter);

        splitter.connect(leftToLeft, 0);
        splitter.connect(rightToLeft, 1);
        splitter.connect(leftToRight, 0);
        splitter.connect(rightToRight, 1);

        leftToLeft.connect(merger, 0, 0);
        rightToLeft.connect(merger, 0, 0);
        leftToRight.connect(merger, 0, 1);
        rightToRight.connect(merger, 0, 1);

        merger.connect(panner);
        panner.connect(fxDryGain);
        panner.connect(eqInput);
        panner.connect(reverbInput);
        panner.connect(maximizerInput);

        eqLowCut.type = "highpass";
        eqLowCut.frequency.value = 20;
        eqLowCut.Q.value = 0.707;
        eqInput.connect(eqLowCut);

        let eqTail = eqLowCut;
        eqBands.forEach(function (band) {
          eqTail.connect(band);
          eqTail = band;
        });
        eqTail.connect(fxWetGain);

        reverbInput.connect(reverbPreDelay);
        reverbLoCut.type = "highpass";
        reverbHiCut.type = "lowpass";
        reverbPreDelay.connect(reverbLoCut);
        reverbLoCut.connect(reverbHiCut);

        const earlyTapTimes = [0.011, 0.019, 0.031, 0.043];
        const earlyTapGains = [0.5, 0.36, 0.26, 0.2];
        const reverbEarlyTaps = earlyTapTimes.map(function (timeSeconds, idx) {
          const delay = audioCtx.createDelay(0.25);
          const gain = audioCtx.createGain();
          delay.delayTime.value = timeSeconds;
          gain.gain.value = earlyTapGains[idx] || 0.2;
          reverbHiCut.connect(delay);
          delay.connect(gain);
          gain.connect(reverbEarlyGain);
          return {
            delay,
            gain,
            baseTime: timeSeconds,
          };
        });
        reverbEarlyGain.connect(reverbWetGain);

        reverbHiCut.connect(reverbLateInput);
        reverbLateInput.connect(reverbLateLeftDelay);
        reverbLateInput.connect(reverbLateRightDelay);

        reverbLateLeftDelay.connect(reverbLeftDamping);
        reverbLateRightDelay.connect(reverbRightDamping);

        reverbLeftDamping.type = "lowpass";
        reverbRightDamping.type = "lowpass";

        reverbLeftDamping.connect(reverbLeftFeedback);
        reverbRightDamping.connect(reverbRightFeedback);

        // Keep a cross-feedback matrix to avoid doubling loop gain.
        reverbLeftFeedback.connect(reverbLateRightDelay);
        reverbRightFeedback.connect(reverbLateLeftDelay);

        reverbLeftDamping.connect(reverbLeftToLeft);
        reverbLeftDamping.connect(reverbLeftToRight);
        reverbRightDamping.connect(reverbRightToLeft);
        reverbRightDamping.connect(reverbRightToRight);

        reverbLeftToLeft.connect(reverbWidthMerger, 0, 0);
        reverbRightToLeft.connect(reverbWidthMerger, 0, 0);
        reverbLeftToRight.connect(reverbWidthMerger, 0, 1);
        reverbRightToRight.connect(reverbWidthMerger, 0, 1);

        reverbWidthMerger.connect(reverbWetGain);
        reverbWetGain.connect(fxWetGain);

        maximizerInput.connect(maximizerPreGain);
        maximizerPreGain.connect(maximizerPreAnalyser);
        maximizerPreGain.connect(maximizerPreSplit);
        maximizerPreSplit.connect(maximizerPreLeftAnalyser, 0);
        maximizerPreSplit.connect(maximizerPreRightAnalyser, 1);
        maximizerPreAnalyser.connect(maximizerCompressor);
        maximizerCompressor.connect(maximizerSoftClip);
        maximizerSoftClip.connect(maximizerPostAnalyser);
        maximizerSoftClip.connect(maximizerPostSplit);
        maximizerPostSplit.connect(maximizerPostLeftAnalyser, 0);
        maximizerPostSplit.connect(maximizerPostRightAnalyser, 1);
        maximizerPostAnalyser.connect(maximizerCeilingGain);
        maximizerCeilingGain.connect(maximizerAnalyser);
        maximizerCeilingGain.connect(maximizerOutSplit);
        maximizerOutSplit.connect(maximizerOutLeftAnalyser, 0);
        maximizerOutSplit.connect(maximizerOutRightAnalyser, 1);
        maximizerAnalyser.connect(fxWetGain);

        const reverbModulators = [
          reverbLateLeftDelay,
          reverbLateRightDelay,
        ].map(function (targetDelay, index) {
          const lfo = audioCtx.createOscillator();
          const depth = audioCtx.createGain();
          lfo.type = "sine";
          lfo.frequency.value = 0.35 + index * 0.09;
          depth.gain.value = 0;
          lfo.connect(depth);
          depth.connect(targetDelay.delayTime);
          lfo.start();
          return {
            lfo,
            depth,
          };
        });

        fxDryGain.connect(outputGain);
        fxWetGain.connect(outputGain);
        outputGain.connect(analyser);

        inserts.set(insert.id, {
          inputGain,
          splitter,
          leftToLeft,
          rightToLeft,
          leftToRight,
          rightToRight,
          merger,
          panner,
          fxDryGain,
          fxWetGain,
          eqInput,
          eqLowCut,
          eqBands,
          reverbInput,
          reverbPreDelay,
          reverbLoCut,
          reverbHiCut,
          reverbEarlyGain,
          reverbEarlyTaps,
          reverbLateInput,
          reverbLateLeftDelay,
          reverbLateRightDelay,
          reverbLeftFeedback,
          reverbRightFeedback,
          reverbLeftDamping,
          reverbRightDamping,
          reverbLeftToLeft,
          reverbRightToLeft,
          reverbLeftToRight,
          reverbRightToRight,
          reverbWidthMerger,
          reverbModulators,
          reverbWetGain,
          maximizerInput,
          maximizerPreGain,
          maximizerPreAnalyser,
          maximizerCompressor,
          maximizerSoftClip,
          maximizerPostAnalyser,
          maximizerPreSplit,
          maximizerPostSplit,
          maximizerOutSplit,
          maximizerPreLeftAnalyser,
          maximizerPreRightAnalyser,
          maximizerPostLeftAnalyser,
          maximizerPostRightAnalyser,
          maximizerOutLeftAnalyser,
          maximizerOutRightAnalyser,
          maximizerCeilingGain,
          maximizerAnalyser,
          outputGain,
          analyser,
          meterData: new Uint8Array(analyser.fftSize),
          spectrumData: new Uint8Array(analyser.frequencyBinCount),
          maximizerMeterWaveform: new Uint8Array(maximizerAnalyser.fftSize),
          maximizerPreWaveform: new Uint8Array(maximizerPreAnalyser.fftSize),
          maximizerPostWaveform: new Uint8Array(maximizerPostAnalyser.fftSize),
          maximizerPreLeftWaveform: new Uint8Array(maximizerPreLeftAnalyser.fftSize),
          maximizerPreRightWaveform: new Uint8Array(maximizerPreRightAnalyser.fftSize),
          maximizerPostLeftWaveform: new Uint8Array(maximizerPostLeftAnalyser.fftSize),
          maximizerPostRightWaveform: new Uint8Array(maximizerPostRightAnalyser.fftSize),
          maximizerOutLeftWaveform: new Uint8Array(maximizerOutLeftAnalyser.fftSize),
          maximizerOutRightWaveform: new Uint8Array(maximizerOutRightAnalyser.fftSize),
          maximizerWaveform: new Uint8Array(maximizerAnalyser.fftSize),
          meterLevel: 0,
        });
      });

      settings.forEach(function (insert) {
        const node = inserts.get(insert.id);
        if (!node) {
          return;
        }

        const routes =
          Array.isArray(insert.routesTo) && insert.routesTo.length > 0
            ? insert.routesTo
            : insert.isMaster
              ? []
              : ["master"];

        let hasConnectedRoute = false;
        routes.forEach(function (targetId) {
          const target = inserts.get(targetId);
          if (!target) {
            return;
          }
          node.analyser.connect(target.inputGain);
          hasConnectedRoute = true;
        });

        if (insert.isMaster || !hasConnectedRoute) {
          node.analyser.connect(audioCtx.destination);
        }
      });

      mixerGraphRef.current = {
        signature,
        inserts,
      };

      return mixerGraphRef.current;
    },
    [ensureContext],
  );

  const applyMixerSettingsToGraph = useCallback(function () {
    const graph = mixerGraphRef.current;
    const audioCtx = audioCtxRef.current;
    if (!graph || !audioCtx) {
      return;
    }

    const now = audioCtx.currentTime;
    mixerSettingsRef.current.forEach(function (insert) {
      const node = graph.inserts.get(insert.id);
      if (!node) {
        return;
      }

      const smoothTo = function (param, targetValue, atTime) {
        param.cancelScheduledValues(atTime);
        param.setValueAtTime(param.value, atTime);
        param.linearRampToValueAtTime(targetValue, atTime + 0.018);
      };

      const targetFader = insert.active
        ? Math.max(0, Math.min(1.25, insert.fader))
        : 0;
      const targetPan = Math.max(-1, Math.min(1, insert.pan));
      const targetSeparation = Math.max(
        -1,
        Math.min(1, insert.stereoSeparation),
      );
      const activeFx = getActiveFxState(insert);
      const eqEnabled = activeFx.eqEnabled;
      const reverbEnabled = activeFx.reverbEnabled;
      const maximizerEnabled = activeFx.maximizerEnabled;
      const eqParams = activeFx.eqParams;
      const reverbParams = activeFx.reverbParams;
      const maximizerParams = activeFx.maximizerParams;
      const hasInsertFx = eqEnabled || maximizerEnabled;

      const width = 1 - targetSeparation;
      const directGain = 0.5 * (1 + width);
      const crossGain = 0.5 * (1 - width);

      node.leftToLeft.gain.setValueAtTime(directGain, now);
      node.rightToRight.gain.setValueAtTime(directGain, now);
      node.rightToLeft.gain.setValueAtTime(crossGain, now);
      node.leftToRight.gain.setValueAtTime(crossGain, now);

      node.panner.pan.setValueAtTime(targetPan, now);

      const dryMix = hasInsertFx
        ? 0
        : reverbEnabled
          ? clamp(1 - reverbParams.dryWet, 0, 1)
          : 1;
      const wetMix = hasInsertFx || reverbEnabled
        ? 1
        : 0;

      smoothTo(node.fxDryGain.gain, dryMix, now);
      smoothTo(node.fxWetGain.gain, wetMix, now);
      smoothTo(node.eqInput.gain, eqEnabled ? 1 : 0, now);
      smoothTo(node.eqLowCut.frequency, 20, now);
      node.eqLowCut.Q.setValueAtTime(0.707, now);

      if (Array.isArray(node.eqBands)) {
        node.eqBands.forEach(function (bandNode, index) {
          const point = eqParams.points[index] || {
            frequencyHz: GRAPHIC_EQ_DEFAULT_POINT_FREQUENCIES[index],
            gainDb: 0,
            q: 1.2,
            bandType: getDefaultEqBandType(index),
          };
          bandNode.type = sanitizeEqBandType(
            point.bandType,
            getDefaultEqBandType(index),
          );
          bandNode.frequency.setValueAtTime(point.frequencyHz, now);
          bandNode.Q.setValueAtTime(point.q, now);
          smoothTo(bandNode.gain, eqEnabled ? point.gainDb : 0, now);
        });
      }

      const reverbSize = reverbEnabled ? clamp(reverbParams.size, 0, 1) : 0.62;
      const reverbDiffusion = reverbEnabled
        ? clamp(reverbParams.diffusion, 0, 1)
        : 0.72;
      const reverbDamping = reverbEnabled
        ? clamp(reverbParams.damping, 0, 1)
        : 0.45;
      const reverbDecay = reverbEnabled
        ? clamp(reverbParams.decayTime, 0.2, 20)
        : 2.8;
      const isFreeze = reverbEnabled && Boolean(reverbParams.freeze);

      const preDelaySec =
        (reverbEnabled ? clamp(reverbParams.preDelayMs, 0, 250) : 24) / 1000;
      const hiCutHz = reverbEnabled
        ? clamp(reverbParams.hiCutHz, 1200, 18000)
        : 9000;
      const loCutHz = reverbEnabled
        ? clamp(reverbParams.loCutHz, 20, 1200)
        : 130;
      const earlyMix = reverbEnabled
        ? clamp(reverbParams.earlyReflections, 0, 1)
        : 0.38;
      const widthValue = reverbEnabled ? clamp(reverbParams.width, 0, 1) : 0.9;
      const modDepth = reverbEnabled
        ? clamp(reverbParams.modulationDepth, 0, 1)
        : 0.22;
      const modRate = reverbEnabled
        ? clamp(reverbParams.modulationRateHz, 0, 8)
        : 0.35;

      const leftBaseDelay =
        0.029 + reverbSize * 0.053 + reverbDiffusion * 0.011;
      const rightBaseDelay =
        0.037 + reverbSize * 0.061 + reverbDiffusion * 0.013;
      const feedbackBase = isFreeze
        ? 0.988
        : clamp(
            0.24 + reverbDecay / 34 + reverbSize * 0.14 + reverbDiffusion * 0.1,
            0.2,
            0.82,
          );
      const earlyLevel = isFreeze ? 0 : earlyMix;
      const reverbInputLevel = reverbEnabled ? (isFreeze ? 0 : 1) : 0;
      const dampFreq = Math.max(900, hiCutHz * (1 - reverbDamping * 0.55));
      const directWidth = 0.5 * (1 + widthValue);
      const crossWidth = 0.5 * (1 - widthValue);

      smoothTo(node.reverbInput.gain, reverbInputLevel, now);
      node.reverbPreDelay.delayTime.setValueAtTime(preDelaySec, now);
      node.reverbLoCut.frequency.setValueAtTime(loCutHz, now);
      node.reverbLoCut.Q.setValueAtTime(0.707, now);
      node.reverbHiCut.frequency.setValueAtTime(hiCutHz, now);
      node.reverbHiCut.Q.setValueAtTime(0.62, now);

      node.reverbLateLeftDelay.delayTime.setValueAtTime(leftBaseDelay, now);
      node.reverbLateRightDelay.delayTime.setValueAtTime(rightBaseDelay, now);
      smoothTo(node.reverbLeftFeedback.gain, feedbackBase, now);
      smoothTo(node.reverbRightFeedback.gain, feedbackBase * 0.985, now);
      node.reverbLeftDamping.frequency.setValueAtTime(dampFreq, now);
      node.reverbRightDamping.frequency.setValueAtTime(dampFreq * 0.96, now);
      node.reverbLeftDamping.Q.setValueAtTime(0.68, now);
      node.reverbRightDamping.Q.setValueAtTime(0.68, now);
      node.reverbEarlyGain.gain.setValueAtTime(earlyLevel, now);

      if (Array.isArray(node.reverbEarlyTaps)) {
        node.reverbEarlyTaps.forEach(function (tap, tapIndex) {
          const spread = reverbSize * 0.018 + reverbDiffusion * 0.011;
          const base = Number(tap.baseTime || 0.012);
          tap.delay.delayTime.setValueAtTime(base + spread, now);
          const tapBaseGain = [0.5, 0.36, 0.26, 0.2][tapIndex] || 0.2;
          tap.gain.gain.setValueAtTime(tapBaseGain * earlyLevel, now);
        });
      }

      node.reverbLeftToLeft.gain.setValueAtTime(directWidth, now);
      node.reverbRightToRight.gain.setValueAtTime(directWidth, now);
      node.reverbRightToLeft.gain.setValueAtTime(crossWidth, now);
      node.reverbLeftToRight.gain.setValueAtTime(crossWidth, now);

      smoothTo(
        node.reverbWetGain.gain,
        reverbEnabled
          ? hasInsertFx
            ? clamp(reverbParams.dryWet, 0, 1)
            : 1
          : 0,
        now,
      );

      if (Array.isArray(node.reverbModulators)) {
        node.reverbModulators.forEach(function (modNode, index) {
          modNode.lfo.frequency.setValueAtTime(
            modRate * (index === 0 ? 1 : 1.17),
            now,
          );
          modNode.depth.gain.setValueAtTime(
            (0.0004 + modDepth * 0.0032) * (index === 0 ? 1 : -1),
            now,
          );
        });
      }

      const mode = sanitizeMaximizerMode(maximizerParams.mode);
      const modeConfigById = {
        "irc-ll": {
          ratio: 12,
          knee: 1.2,
          attackFast: 0.0015,
          attackSlow: 0.006,
          releaseFast: 0.04,
          releaseSlow: 0.16,
        },
        "irc-i": {
          ratio: 16,
          knee: 1.8,
          attackFast: 0.001,
          attackSlow: 0.005,
          releaseFast: 0.05,
          releaseSlow: 0.2,
        },
        "irc-ii": {
          ratio: 18,
          knee: 2.3,
          attackFast: 0.0006,
          attackSlow: 0.004,
          releaseFast: 0.06,
          releaseSlow: 0.24,
        },
        "irc-iii": {
          ratio: 24,
          knee: 3.1,
          attackFast: 0.0008,
          attackSlow: 0.0045,
          releaseFast: 0.07,
          releaseSlow: 0.28,
        },
        "irc-iv": {
          ratio: 28,
          knee: 4.2,
          attackFast: 0.0012,
          attackSlow: 0.006,
          releaseFast: 0.08,
          releaseSlow: 0.32,
        },
      };
      const modeConfig = modeConfigById[mode] || modeConfigById["irc-ii"];
      const thresholdDb = clamp(maximizerParams.thresholdDb, -24, 0);
      const ceilingDb = clamp(maximizerParams.ceilingDb, -18, 0);
      const character = clamp(maximizerParams.character, 0, 1);
      const truePeakEnabled = Boolean(maximizerParams.truePeakEnabled);
      const driveDb = Math.max(0, -thresholdDb);
      const preGainDb = driveDb;
      const compressorThresholdDb = -0.8;
      const truePeakHeadroomDb = truePeakEnabled ? 0.3 : 0;
      const ceilingGain = Math.pow(
        10,
        (ceilingDb - truePeakHeadroomDb) / 20,
      );
      const attackSec =
        modeConfig.attackFast +
        character * (modeConfig.attackSlow - modeConfig.attackFast);
      const releaseSec =
        modeConfig.releaseFast +
        character * (modeConfig.releaseSlow - modeConfig.releaseFast);
      const kneeDb = modeConfig.knee + character * 1.6;
      const ratio = modeConfig.ratio + (1 - character) * 6;
      const clipStrength = clamp(
        (driveDb / 24) * (0.06 + (1 - character) * 0.12),
        0,
        0.18,
      );

      smoothTo(
        node.maximizerInput.gain,
        maximizerEnabled ? 1 : 0,
        now,
      );
      smoothTo(
        node.maximizerPreGain.gain,
        maximizerEnabled ? Math.pow(10, preGainDb / 20) : 1,
        now,
      );
      node.maximizerCompressor.threshold.setValueAtTime(
        compressorThresholdDb,
        now,
      );
      node.maximizerCompressor.ratio.setValueAtTime(ratio, now);
      node.maximizerCompressor.knee.setValueAtTime(kneeDb, now);
      node.maximizerCompressor.attack.setValueAtTime(attackSec, now);
      node.maximizerCompressor.release.setValueAtTime(releaseSec, now);
      node.maximizerSoftClip.curve =
        maximizerEnabled && clipStrength > 0.001
          ? buildSoftClipCurve(clipStrength)
          : null;
      node.maximizerSoftClip.oversample = truePeakEnabled ? "4x" : "2x";
      smoothTo(
        node.maximizerCeilingGain.gain,
        maximizerEnabled ? ceilingGain : 1,
        now,
      );

      node.outputGain.gain.cancelScheduledValues(now);
      node.outputGain.gain.setValueAtTime(node.outputGain.gain.value, now);
      node.outputGain.gain.linearRampToValueAtTime(targetFader, now + 0.01);
    });
  }, []);

  const getInsertInputNodeForChannel = useCallback(
    function (channel) {
      const graph = mixerGraphRef.current;
      if (!graph) {
        return ensureContext().destination;
      }

      const byChannel = graph.inserts.get(channel.mixerInsertId);
      if (byChannel) {
        return byChannel.inputGain;
      }

      const firstInsert = mixerSettingsRef.current.find(function (insert) {
        return !insert.isMaster;
      });
      const fallbackInsert = graph.inserts.get(firstInsert?.id || "master");
      return fallbackInsert
        ? fallbackInsert.inputGain
        : ensureContext().destination;
    },
    [ensureContext],
  );

  useEffect(
    function () {
      channelsRef.current = channels;
    },
    [channels],
  );

  const playDrumkitBrowserPreview = useCallback(
    async function (samplePath) {
      const safeSamplePath = String(samplePath || "").trim();
      if (!safeSamplePath) {
        return;
      }

      const audioCtx = ensureContext();
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }

      ensureMixerGraph();
      applyMixerSettingsToGraph();

      const buffer = await loadSampleBuffer(safeSamplePath);
      if (!buffer) {
        return;
      }

      const previousVoice = drumkitPreviewVoiceRef.current;
      if (previousVoice?.source) {
        try {
          previousVoice.gain.gain.cancelScheduledValues(audioCtx.currentTime);
          previousVoice.gain.gain.setValueAtTime(
            previousVoice.gain.gain.value || BASE_CHANNEL_TRIGGER_GAIN,
            audioCtx.currentTime,
          );
          previousVoice.gain.gain.linearRampToValueAtTime(
            0.0001,
            audioCtx.currentTime + 0.01,
          );
          previousVoice.source.stop(audioCtx.currentTime + 0.012);
        } catch {
          // Voice might already be ending.
        }
      }

      const graph = mixerGraphRef.current;
      const outputNode =
        graph?.inserts?.get("master")?.inputGain || audioCtx.destination;
      const masterInsert = (mixerSettingsRef.current || []).find(
        function (insert) {
          return insert?.isMaster || insert?.id === "master";
        },
      );
      const masterFader = masterInsert?.active
        ? clamp(Number(masterInsert?.fader ?? 1), 0, 1.25)
        : 0;

      const source = audioCtx.createBufferSource();
      const gain = audioCtx.createGain();
      const masterPreviewGain = audioCtx.createGain();

      source.buffer = buffer;
      gain.gain.setValueAtTime(BASE_CHANNEL_TRIGGER_GAIN, audioCtx.currentTime);
      masterPreviewGain.gain.setValueAtTime(masterFader, audioCtx.currentTime);
      source.connect(gain);
      gain.connect(masterPreviewGain);
      masterPreviewGain.connect(outputNode);

      const voice = { source, gain, masterPreviewGain };
      drumkitPreviewVoiceRef.current = voice;

      const stopPreviewMeterLoop = function () {
        if (drumkitPreviewMeterRafRef.current) {
          cancelAnimationFrame(drumkitPreviewMeterRafRef.current);
          drumkitPreviewMeterRafRef.current = null;
        }
      };

      const updateMasterPreviewMeter = function () {
        const masterNode = mixerGraphRef.current?.inserts?.get("master");
        if (!masterNode || !masterNode.meterData) {
          return;
        }

        masterNode.analyser.getByteTimeDomainData(masterNode.meterData);

        let squareSum = 0;
        let peak = 0;
        for (let i = 0; i < masterNode.meterData.length; i += 1) {
          const centered = (masterNode.meterData[i] - 128) / 128;
          squareSum += centered * centered;

          const absolute = Math.abs(centered);
          if (absolute > peak) {
            peak = absolute;
          }
        }

        const rms = Math.sqrt(squareSum / masterNode.meterData.length);
        const blended = Math.max(
          rms * MIXER_METER_RMS_GAIN,
          peak * MIXER_METER_PEAK_GAIN,
        );
        const gated = blended < MIXER_METER_NOISE_GATE ? 0 : blended;
        const level = Math.min(1, Math.pow(gated, MIXER_METER_RESPONSE_CURVE));

        dispatch(
          setInsertMeter({
            insertId: "master",
            meter: level,
          }),
        );
      };

      if (!transport.isPlaying) {
        stopPreviewMeterLoop();

        const tickPreviewMeter = function () {
          if (drumkitPreviewVoiceRef.current !== voice) {
            stopPreviewMeterLoop();
            return;
          }

          updateMasterPreviewMeter();
          drumkitPreviewMeterRafRef.current =
            requestAnimationFrame(tickPreviewMeter);
        };

        drumkitPreviewMeterRafRef.current =
          requestAnimationFrame(tickPreviewMeter);
      }

      source.onended = function () {
        stopPreviewMeterLoop();

        if (drumkitPreviewVoiceRef.current === voice) {
          drumkitPreviewVoiceRef.current = null;
        }

        dispatch(
          setInsertMeter({
            insertId: "master",
            meter: 0,
          }),
        );
      };

      source.start(audioCtx.currentTime);
    },
    [
      applyMixerSettingsToGraph,
      dispatch,
      ensureContext,
      ensureMixerGraph,
      loadSampleBuffer,
      transport.isPlaying,
    ],
  );

  useEffect(
    function () {
      const onDrumkitPreviewRequest = function (event) {
        const samplePath = String(event?.detail?.samplePath || "").trim();
        if (!samplePath) {
          return;
        }

        void playDrumkitBrowserPreview(samplePath);
      };

      window.addEventListener(DRUMKIT_PREVIEW_EVENT, onDrumkitPreviewRequest);

      return function () {
        window.removeEventListener(
          DRUMKIT_PREVIEW_EVENT,
          onDrumkitPreviewRequest,
        );

        const activeVoice = drumkitPreviewVoiceRef.current;
        if (!activeVoice?.source || !audioCtxRef.current) {
          return;
        }

        if (drumkitPreviewMeterRafRef.current) {
          cancelAnimationFrame(drumkitPreviewMeterRafRef.current);
          drumkitPreviewMeterRafRef.current = null;
        }

        const stopTime = audioCtxRef.current.currentTime;
        try {
          activeVoice.gain.gain.cancelScheduledValues(stopTime);
          activeVoice.gain.gain.setValueAtTime(
            activeVoice.gain.gain.value || BASE_CHANNEL_TRIGGER_GAIN,
            stopTime,
          );
          activeVoice.gain.gain.linearRampToValueAtTime(
            0.0001,
            stopTime + 0.01,
          );
          activeVoice.source.stop(stopTime + 0.012);
        } catch {
          // Voice might already be stopped.
        }

        drumkitPreviewVoiceRef.current = null;
      };
    },
    [playDrumkitBrowserPreview],
  );

  useEffect(
    function () {
      if (!audioCtxRef.current) {
        return;
      }

      const voice = drumkitPreviewVoiceRef.current;
      if (!voice?.masterPreviewGain) {
        return;
      }

      const masterInsert = (mixerSettingsRef.current || []).find(
        function (insert) {
          return insert?.isMaster || insert?.id === "master";
        },
      );
      const target = masterInsert?.active
        ? clamp(Number(masterInsert?.fader ?? 1), 0, 1.25)
        : 0;

      const now = audioCtxRef.current.currentTime;
      voice.masterPreviewGain.gain.cancelScheduledValues(now);
      voice.masterPreviewGain.gain.setValueAtTime(
        voice.masterPreviewGain.gain.value,
        now,
      );
      voice.masterPreviewGain.gain.linearRampToValueAtTime(target, now + 0.01);
    },
    [mixerSettings],
  );

  useEffect(
    function () {
      activePatternRef.current = activePattern;
    },
    [activePattern],
  );

  useEffect(
    function () {
      patternsRef.current = patterns;
    },
    [patterns],
  );

  useEffect(
    function () {
      playlistClipsRef.current = playlistClips;
    },
    [playlistClips],
  );

  useEffect(
    function () {
      transportModeRef.current = transport.mode;
    },
    [transport.mode],
  );

  useEffect(
    function () {
      songLoopEnabledRef.current = Boolean(transport.songLoopEnabled);
    },
    [transport.songLoopEnabled],
  );

  useEffect(
    function () {
      mixerSettingsRef.current = mixerSettings;

      if (!audioCtxRef.current) {
        return;
      }

      ensureMixerGraph();
      applyMixerSettingsToGraph();
    },
    [mixerSettings, ensureMixerGraph, applyMixerSettingsToGraph],
  );

  useEffect(
    function () {
      const sampleRefs = Array.from(
        new Set(
          channels
            .map(function (channel) {
              return channel.sampleRef;
            })
            .filter(Boolean),
        ),
      );

      sampleRefs.forEach(function (sampleRef) {
        const safeSampleUrl = toSafeSampleUrl(sampleRef);
        if (!sampleBufferCacheRef.current.has(safeSampleUrl)) {
          void loadSampleBuffer(sampleRef);
        }
      });
    },
    [channels, loadSampleBuffer],
  );

  useEffect(
    function () {
      if (channels.length === 0) {
        return;
      }

      ensureMixerGraph();

      channels.forEach(function (channel) {
        const pluginRef = String(channel.pluginRef || "").trim();
        if (!pluginRef) {
          return;
        }

        if (!getPluginInstrument(pluginRef)) {
          return;
        }

        const key = getPluginInstrumentCacheKey(pluginRef, channel.id);

        if (pluginInstrumentFailedRef.current.has(key)) {
          return;
        }

        const outputNode = getInsertInputNodeForChannel(channel);

        void loadPluginInstrument(pluginRef, channel.id, outputNode);
      });
    },
    [
      channels,
      ensureMixerGraph,
      getInsertInputNodeForChannel,
      loadPluginInstrument,
    ],
  );

  useEffect(
    function () {
      const stopActiveChannelSamples = function (channelId, atTime) {
        const voices = activeSampleVoicesRef.current.get(channelId);
        if (!voices || voices.size === 0) {
          return;
        }

        voices.forEach(function (voice) {
          try {
            const voiceStopAt = scheduleSmoothGainStop(
              voice.gain.gain,
              atTime,
              CUT_ITSELF_RELEASE_SEC,
            );

            if (Array.isArray(voice.sources)) {
              voice.sources.forEach(function (sourceNode) {
                try {
                  sourceNode.stop(voiceStopAt + CUT_ITSELF_STOP_PADDING_SEC);
                } catch {
                  return;
                }
              });
            } else if (voice.source) {
              voice.source.stop(voiceStopAt + CUT_ITSELF_STOP_PADDING_SEC);
            }

            if (voice.cleanupTimeout) {
              clearTimeout(voice.cleanupTimeout);
            }
          } catch {
            return;
          }
        });

        voices.clear();
      };

      const stopActiveChannelSynthVoices = function (channelId, atTime) {
        const voices = activeSynthVoicesRef.current.get(channelId);
        if (!voices || voices.size === 0) {
          return;
        }

        voices.forEach(function (voice) {
          try {
            if (voice.node && typeof voice.node.stop === "function") {
              voice.node.stop(atTime);
            }
          } catch {
            return;
          }
        });

        voices.clear();
      };

      const stopAllActiveSamples = function (atTime) {
        Array.from(activeSampleVoicesRef.current.keys()).forEach(
          function (channelId) {
            stopActiveChannelSamples(channelId, atTime);
          },
        );

        Array.from(activeSynthVoicesRef.current.keys()).forEach(
          function (channelId) {
            stopActiveChannelSynthVoices(channelId, atTime);
          },
        );
      };

      const resetMeters = function () {
        lastMeterDispatchAtRef.current = 0;
        const silentSpectrum = Array.from({ length: EQ_SPECTRUM_BINS }).map(
          function () {
            return 0;
          },
        );
        const makeSilentWaveform = function (insert) {
          const bins = Math.max(
            1,
            Array.isArray(insert?.meterWaveform)
              ? insert.meterWaveform.length
              : 220,
          );
          return Array.from({ length: bins }).map(function () {
            return 0;
          });
        };

        const graph = mixerGraphRef.current;
        if (graph) {
          graph.inserts.forEach(function (node) {
            node.meterLevel = 0;
          });
        }

        mixerSettingsRef.current.forEach(function (insert) {
          dispatch(
            setInsertMeter({
              insertId: insert.id,
              meter: 0,
              spectrum: silentSpectrum,
              waveform: makeSilentWaveform(insert),
              maximizerReduction: 0,
              maximizerOutputDb: -96,
              maximizerStereoMeter: {
                leftVolumeDb: -96,
                leftReductionDb: 0,
                rightReductionDb: 0,
                rightVolumeDb: -96,
              },
            }),
          );
        });

        lastMeterLevelsRef.current.clear();
        lastMeterSpectrumRef.current.clear();
        lastMeterWaveformRef.current.clear();
        lastMaximizerReductionRef.current.clear();
        lastMaximizerOutputDbRef.current.clear();
        lastMaximizerStereoMeterRef.current.clear();
        maximizerTraceHistoryRef.current.clear();
        lastMaximizerVisualKeyRef.current.clear();
      };

      const updateMixerMeters = function (now) {
        if (now - lastMeterDispatchAtRef.current < 1 / 45) {
          return;
        }
        lastMeterDispatchAtRef.current = now;

        const graph = mixerGraphRef.current;
        if (!graph) {
          return;
        }

        graph.inserts.forEach(function (node, insertId) {
          node.analyser.getByteTimeDomainData(node.meterData);

          let squareSum = 0;
          let peak = 0;
          for (let i = 0; i < node.meterData.length; i += 1) {
            const centered = (node.meterData[i] - 128) / 128;
            squareSum += centered * centered;

            const absolute = Math.abs(centered);
            if (absolute > peak) {
              peak = absolute;
            }
          }

          const rms = Math.sqrt(squareSum / node.meterData.length);
          const blended = Math.max(
            rms * MIXER_METER_RMS_GAIN,
            peak * MIXER_METER_PEAK_GAIN,
          );
          const gated = blended < MIXER_METER_NOISE_GATE ? 0 : blended;
          const instantMeter = Math.min(
            1,
            Math.pow(gated, MIXER_METER_RESPONSE_CURVE),
          );
          node.meterLevel = Math.max(
            instantMeter,
            node.meterLevel * MIXER_METER_DECAY,
          );

          const prevMeter = lastMeterLevelsRef.current.get(insertId);
          const isSpectrumTarget =
            insertId === spectrumTargetInsertIdRef.current;
          let nextSpectrum = null;
          let spectrumChanged = false;
          let nextWaveform = null;
          let waveformChanged = false;
          let maximizerReduction = 0;
          let maximizerOutputDb = -96;
          let maximizerStereoMeter = {
            leftVolumeDb: -96,
            leftReductionDb: 0,
            rightReductionDb: 0,
            rightVolumeDb: -96,
          };
          let reductionChanged = false;
          let outputDbChanged = false;
          let stereoChanged = false;

          if (
            node.maximizerCompressor &&
            Number.isFinite(Number(node.maximizerCompressor.reduction))
          ) {
            maximizerReduction = clamp(
              Math.max(0, -Number(node.maximizerCompressor.reduction)),
              0,
              36,
            );
          }

          if (node.maximizerAnalyser && node.maximizerMeterWaveform) {
            node.maximizerAnalyser.getByteTimeDomainData(node.maximizerMeterWaveform);
            let meterPeak = 0;
            for (
              let meterIndex = 0;
              meterIndex < node.maximizerMeterWaveform.length;
              meterIndex += 1
            ) {
              const normalized = Math.abs(
                (Number(node.maximizerMeterWaveform[meterIndex] || 128) - 128) /
                  128,
              );
              if (normalized > meterPeak) {
                meterPeak = normalized;
              }
            }
            maximizerOutputDb = clamp(
              20 * Math.log10(Math.max(meterPeak, 0.0001)),
              -96,
              6,
            );
          }

          const calcPeakFromWaveform = function (waveform) {
            let peak = 0;
            for (let index = 0; index < waveform.length; index += 1) {
              const normalized = Math.abs(
                (Number(waveform[index] || 128) - 128) / 128,
              );
              if (normalized > peak) {
                peak = normalized;
              }
            }
            return peak;
          };

          if (
            node.maximizerPreLeftAnalyser &&
            node.maximizerPreRightAnalyser &&
            node.maximizerPostLeftAnalyser &&
            node.maximizerPostRightAnalyser &&
            node.maximizerOutLeftAnalyser &&
            node.maximizerOutRightAnalyser &&
            node.maximizerPreLeftWaveform &&
            node.maximizerPreRightWaveform &&
            node.maximizerPostLeftWaveform &&
            node.maximizerPostRightWaveform &&
            node.maximizerOutLeftWaveform &&
            node.maximizerOutRightWaveform
          ) {
            node.maximizerPreLeftAnalyser.getByteTimeDomainData(
              node.maximizerPreLeftWaveform,
            );
            node.maximizerPreRightAnalyser.getByteTimeDomainData(
              node.maximizerPreRightWaveform,
            );
            node.maximizerPostLeftAnalyser.getByteTimeDomainData(
              node.maximizerPostLeftWaveform,
            );
            node.maximizerPostRightAnalyser.getByteTimeDomainData(
              node.maximizerPostRightWaveform,
            );
            node.maximizerOutLeftAnalyser.getByteTimeDomainData(
              node.maximizerOutLeftWaveform,
            );
            node.maximizerOutRightAnalyser.getByteTimeDomainData(
              node.maximizerOutRightWaveform,
            );

            const preLeftDb = 20 * Math.log10(
              Math.max(calcPeakFromWaveform(node.maximizerPreLeftWaveform), 0.0001),
            );
            const preRightDb = 20 * Math.log10(
              Math.max(calcPeakFromWaveform(node.maximizerPreRightWaveform), 0.0001),
            );
            const postLeftDb = 20 * Math.log10(
              Math.max(calcPeakFromWaveform(node.maximizerPostLeftWaveform), 0.0001),
            );
            const postRightDb = 20 * Math.log10(
              Math.max(calcPeakFromWaveform(node.maximizerPostRightWaveform), 0.0001),
            );
            const outLeftDb = 20 * Math.log10(
              Math.max(calcPeakFromWaveform(node.maximizerOutLeftWaveform), 0.0001),
            );
            const outRightDb = 20 * Math.log10(
              Math.max(calcPeakFromWaveform(node.maximizerOutRightWaveform), 0.0001),
            );

            maximizerStereoMeter = {
              leftVolumeDb: clamp(outLeftDb, -96, 6),
              leftReductionDb: clamp(preLeftDb - postLeftDb, 0, 36),
              rightReductionDb: clamp(preRightDb - postRightDb, 0, 36),
              rightVolumeDb: clamp(outRightDb, -96, 6),
            };
          }

          if (isSpectrumTarget && node.spectrumData) {
            node.analyser.getByteFrequencyData(node.spectrumData);
            nextSpectrum = buildEqSpectrumFromAnalyserData(
              node.analyser,
              node.spectrumData,
            );

            if (nextSpectrum) {
              const prevSpectrum = lastMeterSpectrumRef.current.get(insertId);
              if (
                !Array.isArray(prevSpectrum) ||
                prevSpectrum.length !== nextSpectrum.length
              ) {
                spectrumChanged = true;
              } else {
                for (
                  let spectrumIndex = 0;
                  spectrumIndex < nextSpectrum.length;
                  spectrumIndex += 1
                ) {
                  if (
                    Math.abs(
                      nextSpectrum[spectrumIndex] - prevSpectrum[spectrumIndex],
                    ) > 0.028
                  ) {
                    spectrumChanged = true;
                    break;
                  }
                }
              }
            }
          }

          if (
            isSpectrumTarget &&
            node.maximizerAnalyser &&
            node.maximizerWaveform
          ) {
            const fxInsert = mixerSettingsRef.current.find(function (item) {
              return item.id === insertId;
            });
            const activeFxState = getActiveFxState(fxInsert);
            const visualKey = JSON.stringify({
              thresholdDb: Number(activeFxState.maximizerParams?.thresholdDb ?? 0),
              ceilingDb: Number(activeFxState.maximizerParams?.ceilingDb ?? -1),
              character: Number(activeFxState.maximizerParams?.character ?? 0.5),
              truePeakEnabled: Boolean(
                activeFxState.maximizerParams?.truePeakEnabled,
              ),
              enabled: Boolean(activeFxState.maximizerEnabled),
            });
            const prevVisualKey = lastMaximizerVisualKeyRef.current.get(insertId);
            if (prevVisualKey !== visualKey) {
              lastMaximizerVisualKeyRef.current.set(insertId, visualKey);
            }

            node.maximizerAnalyser.getByteTimeDomainData(node.maximizerWaveform);

            if (node.maximizerPreAnalyser && node.maximizerPreWaveform) {
              node.maximizerPreAnalyser.getByteTimeDomainData(
                node.maximizerPreWaveform,
              );
            }
            if (node.maximizerPostAnalyser && node.maximizerPostWaveform) {
              node.maximizerPostAnalyser.getByteTimeDomainData(
                node.maximizerPostWaveform,
              );
            }

            const tracePointsPerFrame = 24;
            const nextTraceSamples = [];
            const traceStep = Math.max(
              1,
              Math.floor(node.maximizerWaveform.length / tracePointsPerFrame),
            );
            for (
              let traceIndex = 0;
              traceIndex < tracePointsPerFrame;
              traceIndex += 1
            ) {
              const sourceIndex = Math.min(
                node.maximizerWaveform.length - 1,
                traceIndex * traceStep,
              );
              nextTraceSamples.push(
                clamp(
                  (Number(node.maximizerWaveform[sourceIndex] || 128) - 128) /
                    128,
                  -1,
                  1,
                ),
              );
            }

            const previousTrace =
              maximizerTraceHistoryRef.current.get(insertId) || [];
            const maxTraceLength = 18000;
            const nextTrace = previousTrace
              .concat(nextTraceSamples)
              .slice(-maxTraceLength);
            maximizerTraceHistoryRef.current.set(insertId, nextTrace);

            const bins = 220;
            const prevDisplayWaveform =
              lastMeterWaveformRef.current.get(insertId);
            const shiftBins = 2;

            const buildInjectedBins = function () {
              const samplesPerInjectedBin = Math.max(
                1,
                Math.floor(nextTraceSamples.length / shiftBins),
              );

              return Array.from({ length: shiftBins }).map(function (_, index) {
                const start = index * samplesPerInjectedBin;
                const end = Math.min(
                  nextTraceSamples.length,
                  start + samplesPerInjectedBin,
                );
                if (end <= start) {
                  return 0;
                }

                let strongest = 0;
                for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
                  const sample = Number(nextTraceSamples[sampleIndex] || 0);
                  if (Math.abs(sample) > Math.abs(strongest)) {
                    strongest = sample;
                  }
                }
                return clamp(strongest, -1, 1);
              });
            };

            if (
              Array.isArray(prevDisplayWaveform) &&
              prevDisplayWaveform.length === bins
            ) {
              const injected = buildInjectedBins();
              nextWaveform = injected.concat(
                prevDisplayWaveform.slice(0, bins - shiftBins),
              );
            } else {
              const chunkSize = Math.max(1, Math.floor(nextTrace.length / bins));
              const seeded = Array.from({ length: bins }).map(function (_, index) {
                const start = index * chunkSize;
                const end = Math.min(nextTrace.length, start + chunkSize);
                if (start >= nextTrace.length || end <= start) {
                  return 0;
                }

                let strongest = 0;
                for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
                  const sample = Number(nextTrace[sampleIndex] || 0);
                  if (Math.abs(sample) > Math.abs(strongest)) {
                    strongest = sample;
                  }
                }
                return clamp(strongest, -1, 1);
              });

              nextWaveform = seeded.map(function (value, index) {
                const prev = seeded[Math.max(0, index - 1)];
                const next = seeded[Math.min(seeded.length - 1, index + 1)];
                return clamp(prev * 0.08 + value * 0.84 + next * 0.08, -1, 1);
              });
            }

            const calcPeak = function (buffer) {
              let peak = 0;
              for (let sampleIndex = 0; sampleIndex < buffer.length; sampleIndex += 1) {
                const normalized = Math.abs(
                  (Number(buffer[sampleIndex] || 128) - 128) / 128,
                );
                if (normalized > peak) {
                  peak = normalized;
                }
              }
              return peak;
            };

            const postPeak = calcPeak(node.maximizerWaveform);
            const postDb = 20 * Math.log10(Math.max(postPeak, 0.0001));
            const compressorReduction = maximizerReduction;

            if (node.maximizerPreWaveform && node.maximizerPostWaveform) {
              const prePeak = calcPeak(node.maximizerPreWaveform);
              const postLimiterPeak = calcPeak(node.maximizerPostWaveform);
              const preDb = 20 * Math.log10(Math.max(prePeak, 0.0001));
              const postLimiterDb = 20 * Math.log10(
                Math.max(postLimiterPeak, 0.0001),
              );
              const peakReduction = clamp(preDb - postLimiterDb, 0, 36);
              maximizerReduction = clamp(
                compressorReduction * 0.75 + peakReduction * 0.25,
                0,
                36,
              );
            } else {
              maximizerReduction = clamp(compressorReduction, 0, 36);
            }
            maximizerOutputDb = clamp(postDb, -96, 6);

            waveformChanged = true;
          }
          const prevReduction = lastMaximizerReductionRef.current.get(insertId);
          reductionChanged =
            prevReduction === undefined ||
            Math.abs((prevReduction || 0) - maximizerReduction) > 0.14;
          const prevOutputDb = lastMaximizerOutputDbRef.current.get(insertId);
          outputDbChanged =
            prevOutputDb === undefined ||
            Math.abs((prevOutputDb || -96) - maximizerOutputDb) > 0.2;
          const prevStereo = lastMaximizerStereoMeterRef.current.get(insertId);
          stereoChanged =
            !prevStereo ||
            Math.abs(
              Number(prevStereo.leftVolumeDb || -96) -
                Number(maximizerStereoMeter.leftVolumeDb || -96),
            ) > 0.2 ||
            Math.abs(
              Number(prevStereo.leftReductionDb || 0) -
                Number(maximizerStereoMeter.leftReductionDb || 0),
            ) > 0.15 ||
            Math.abs(
              Number(prevStereo.rightReductionDb || 0) -
                Number(maximizerStereoMeter.rightReductionDb || 0),
            ) > 0.15 ||
            Math.abs(
              Number(prevStereo.rightVolumeDb || -96) -
                Number(maximizerStereoMeter.rightVolumeDb || -96),
            ) > 0.2;

          const meterChanged =
            prevMeter === undefined ||
            Math.abs(prevMeter - node.meterLevel) > 0.018 ||
            (node.meterLevel < 0.01 && prevMeter >= 0.01);

          if (
            meterChanged ||
            spectrumChanged ||
            waveformChanged ||
            reductionChanged ||
            outputDbChanged ||
            stereoChanged
          ) {
            lastMeterLevelsRef.current.set(insertId, node.meterLevel);
            if (isSpectrumTarget && nextSpectrum) {
              lastMeterSpectrumRef.current.set(insertId, nextSpectrum);
            }
            if (isSpectrumTarget && nextWaveform) {
              lastMeterWaveformRef.current.set(insertId, nextWaveform);
            }
            lastMaximizerReductionRef.current.set(insertId, maximizerReduction);
            lastMaximizerOutputDbRef.current.set(insertId, maximizerOutputDb);
            lastMaximizerStereoMeterRef.current.set(
              insertId,
              maximizerStereoMeter,
            );

            dispatch(
              setInsertMeter({
                insertId,
                meter: node.meterLevel,
                spectrum:
                  isSpectrumTarget && nextSpectrum ? nextSpectrum : undefined,
                waveform:
                  isSpectrumTarget && nextWaveform ? nextWaveform : undefined,
                maximizerReduction,
                maximizerOutputDb,
                maximizerStereoMeter,
              }),
            );
          }
        });
      };

      const audioCtx = ensureContext();
      const sixteenth = 60 / transport.bpm / 4;

      const scheduleSample = function (
        sampleBuffer,
        time,
        gainAmount,
        panValue,
        channel,
        outputNode,
        midiPitch,
        noteLengthSteps,
      ) {
        const source = audioCtx.createBufferSource();
        const gain = audioCtx.createGain();
        const envelopeGain = audioCtx.createGain();
        const panner = audioCtx.createStereoPanner();

        const settings = getSafeSampleSettings(channel.sampleSettings);

        const getNormalizeGain = function () {
          if (!settings.normalize) {
            return 1;
          }

          const cached = sampleNormalizeGainRef.current.get(sampleBuffer);
          if (Number.isFinite(cached)) {
            return cached;
          }

          let peak = 0;
          const channelsCount = Math.max(
            1,
            Number(sampleBuffer.numberOfChannels || 1),
          );

          for (let ch = 0; ch < channelsCount; ch += 1) {
            const channelData = sampleBuffer.getChannelData(ch);
            const step = Math.max(1, Math.floor(channelData.length / 64000));

            for (let i = 0; i < channelData.length; i += step) {
              const abs = Math.abs(channelData[i]);
              if (abs > peak) {
                peak = abs;
              }
            }
          }

          const normalized =
            peak > 0.0001 ? Math.max(0.25, Math.min(4, 0.9 / peak)) : 1;

          sampleNormalizeGainRef.current.set(sampleBuffer, normalized);
          return normalized;
        };

        const safeMidiPitch = Number.isFinite(midiPitch)
          ? midiPitch
          : DEFAULT_SAMPLE_MIDI_PITCH;
        const pitchRate = Math.pow(2, Number(settings.pitchCents || 0) / 1200);
        const basePlaybackRate = Math.max(
          0.125,
          Math.min(8, midiPitchToPlaybackRate(safeMidiPitch) * pitchRate),
        );
        const sampleReadDuration = Math.max(
          0.01,
          sampleBuffer.duration * (settings.lengthPct / 100),
        );
        const stretchProfile = getTimeStretchProfile(
          settings,
          sampleReadDuration,
          transport.bpm,
          basePlaybackRate,
        );
        const playbackRate = stretchProfile.playbackRate;

        if (settings.cutItself) {
          stopActiveChannelSamples(channel.id, time);
        }

        const naturalPlayableDuration = Math.max(
          0.01,
          sampleReadDuration / playbackRate,
        );
        const samplePlayableDuration = Math.max(
          0.01,
          stretchProfile.useGranularStretch
            ? stretchProfile.targetDurationSec
            : naturalPlayableDuration,
        );
        const noteGateDuration = Math.max(
          0.01,
          Number(noteLengthSteps || 1) * sixteenth,
        );
        const hasAudibleEnvelopeShape =
          Number(settings.envDelayMs || 0) > 0 ||
          Number(settings.envAttackMs || 0) > 0 ||
          Number(settings.envHoldMs || 0) > 0 ||
          Number(settings.envDecayMs || 0) > 0 ||
          Number(settings.envReleaseMs || 0) > 0 ||
          Number(settings.envSustainPct ?? 100) < 100;
        const shouldApplyEnvelope =
          Boolean(settings.envEnabled) && hasAudibleEnvelopeShape;
        const envReleaseSec = shouldApplyEnvelope
          ? Math.max(0, Number(settings.envReleaseMs ?? 0) / 1000)
          : 0;
        const sourcePlayDuration = shouldApplyEnvelope
          ? Math.max(
              0.01,
              Math.min(
                samplePlayableDuration,
                noteGateDuration + envReleaseSec,
              ),
            )
          : samplePlayableDuration;
        const envelopeGateDuration = shouldApplyEnvelope
          ? Math.max(0.01, Math.min(noteGateDuration, sourcePlayDuration))
          : sourcePlayDuration;
        const fadeInSec = sourcePlayDuration * (settings.fadeInPct / 100);
        const shapedFadeOutPct = Math.pow(settings.fadeOutPct / 100, 0.7) * 100;
        const fadeOutSec = sourcePlayDuration * (shapedFadeOutPct / 100);
        const fadeTotal = fadeInSec + fadeOutSec;
        const fadeScale =
          fadeTotal > sourcePlayDuration * 0.98
            ? (sourcePlayDuration * 0.98) / fadeTotal
            : 1;
        const finalFadeIn = fadeInSec * fadeScale;
        const finalFadeOut = fadeOutSec * fadeScale;
        const finalGain = Math.max(0, gainAmount * getNormalizeGain());
        const sampleStopAt = time + sourcePlayDuration;
        const fadeOutStart = Math.max(time, sampleStopAt - finalFadeOut);
        const requiredBufferDuration = Math.max(
          0.01,
          sourcePlayDuration * playbackRate,
        );

        let scheduledBuffer = sampleBuffer;
        if (stretchProfile.useGranularStretch) {
          const desiredBufferedDuration = Math.max(
            0.01,
            sourcePlayDuration * playbackRate,
          );
          const stretchFactor = clamp(
            sampleReadDuration / desiredBufferedDuration,
            0.25,
            4,
          );
          const readFrames = Math.max(
            16,
            Math.floor(sampleReadDuration * sampleBuffer.sampleRate),
          );
          const cacheKey =
            readFrames +
            "|" +
            stretchFactor.toFixed(4) +
            "|" +
            sampleBuffer.numberOfChannels;

          let perSampleCache =
            stretchedSampleBufferCacheRef.current.get(sampleBuffer);
          if (!perSampleCache) {
            perSampleCache = new Map();
            stretchedSampleBufferCacheRef.current.set(
              sampleBuffer,
              perSampleCache,
            );
          }

          const cached = perSampleCache.get(cacheKey);
          if (cached) {
            scheduledBuffer = cached;
          } else {
            scheduledBuffer = createWsolaStretchedBufferFromSample(
              audioCtx,
              sampleBuffer,
              sampleReadDuration,
              stretchFactor,
              false,
            );
            perSampleCache.set(cacheKey, scheduledBuffer);
          }
        }

        source.buffer = scheduledBuffer;

        source.playbackRate.setValueAtTime(playbackRate, time);
        if (finalFadeIn > 0.001) {
          gain.gain.setValueAtTime(MIN_AUDIO_GAIN, time);
          gain.gain.linearRampToValueAtTime(finalGain, time + finalFadeIn);
        } else {
          gain.gain.setValueAtTime(finalGain, time);
        }

        gain.gain.setValueAtTime(finalGain, fadeOutStart);
        if (finalFadeOut > 0.001) {
          gain.gain.exponentialRampToValueAtTime(MIN_AUDIO_GAIN, sampleStopAt);
        } else {
          gain.gain.setValueAtTime(MIN_AUDIO_GAIN, sampleStopAt);
        }

        panner.pan.setValueAtTime(Math.max(-1, Math.min(1, panValue)), time);

        source.connect(gain);
        gain.connect(envelopeGain);
        if (shouldApplyEnvelope) {
          applyVolumeEnvelopeToGain(
            envelopeGain.gain,
            time,
            envelopeGateDuration,
            settings,
          );
        } else {
          envelopeGain.gain.setValueAtTime(1, time);
        }
        envelopeGain.connect(panner);
        panner.connect(outputNode);

        const channelVoices =
          activeSampleVoicesRef.current.get(channel.id) || new Set();
        if (!activeSampleVoicesRef.current.has(channel.id)) {
          activeSampleVoicesRef.current.set(channel.id, channelVoices);
        }

        const voice = { source, gain };
        channelVoices.add(voice);
        source.onended = function () {
          channelVoices.delete(voice);
          if (channelVoices.size === 0) {
            activeSampleVoicesRef.current.delete(channel.id);
          }
        };

        source.start(
          time,
          0,
          Math.min(scheduledBuffer.duration, requiredBufferDuration),
        );
        source.stop(sampleStopAt + 0.005);
      };

      const schedulePlaylistAudioClip = function (
        sampleBuffer,
        time,
        outputNode,
        clipLengthSteps,
        clipOffsetSteps,
        channel,
      ) {
        if (!sampleBuffer) {
          return;
        }

        const source = audioCtx.createBufferSource();
        const gain = audioCtx.createGain();
        const panner = audioCtx.createStereoPanner();

        const offsetSec = Math.max(0, Number(clipOffsetSteps || 0) * sixteenth);
        const clipDurationSec = Math.max(
          0.01,
          Math.max(
            0,
            Number(clipLengthSteps || 1) - Number(clipOffsetSteps || 0),
          ) * sixteenth,
        );
        const remainingSampleDuration = Math.max(
          0,
          Number(sampleBuffer.duration || 0) - offsetSec,
        );
        const playDuration = Math.max(
          0,
          Math.min(remainingSampleDuration, clipDurationSec),
        );
        if (playDuration <= 0) {
          return;
        }

        const fadeOutAt = time + Math.max(0, playDuration - 0.012);
        const clipGain = clamp(Number(channel?.volume ?? 0.75) * 0.36, 0.04, 1);
        const clipPan = clamp(Number(channel?.pan ?? 0), -1, 1);

        source.buffer = sampleBuffer;
        gain.gain.setValueAtTime(clipGain, time);
        gain.gain.setValueAtTime(clipGain, fadeOutAt);
        gain.gain.linearRampToValueAtTime(0.0001, time + playDuration);
        panner.pan.setValueAtTime(clipPan, time);

        source.connect(gain);
        gain.connect(panner);
        panner.connect(outputNode);

        const voiceChannelId = channel?.id || "__playlist-audio__";
        const channelVoices =
          activeSampleVoicesRef.current.get(voiceChannelId) || new Set();
        if (!activeSampleVoicesRef.current.has(voiceChannelId)) {
          activeSampleVoicesRef.current.set(voiceChannelId, channelVoices);
        }

        const voice = { source, gain };
        channelVoices.add(voice);
        source.onended = function () {
          channelVoices.delete(voice);
          if (channelVoices.size === 0) {
            activeSampleVoicesRef.current.delete(voiceChannelId);
          }
        };

        source.start(time, offsetSec, playDuration);
        source.stop(time + playDuration + 0.005);
      };

      const schedulePluginInstrument = function (
        pluginRef,
        time,
        gainAmount,
        panValue,
        channel,
        outputNode,
        midiPitch,
        noteLengthSteps,
        channelSettings,
      ) {
        const rawPluginRef = String(pluginRef || "").trim();
        const key = getPluginInstrumentCacheKey(rawPluginRef, channel.id);
        const instrument = pluginInstrumentRef.current.get(key);
        if (!instrument) {
          if (!pluginInstrumentFailedRef.current.has(key)) {
            void loadPluginInstrument(rawPluginRef, channel.id, outputNode);
          }
          return;
        }

        routeInstrumentOutputToNode(instrument, outputNode);

        const safeMidiPitch = Number.isFinite(midiPitch)
          ? midiPitch
          : DEFAULT_SAMPLE_MIDI_PITCH;
        const transposedPitch = Math.max(
          0,
          Math.min(
            127,
            safeMidiPitch + Number(channelSettings.pitchCents || 0) / 100,
          ),
        );
        const attackSec = Math.max(
          0,
          Number(channelSettings.attackMs || 0) / 1000,
        );
        const releaseSec = Math.max(
          0,
          Number(channelSettings.releaseMs ?? 420) / 1000,
        );
        const noteDuration = Math.max(
          0.1,
          Number(noteLengthSteps || 1) * sixteenth * 0.95 + releaseSec,
        );
        const noteGain = Math.max(
          0,
          gainAmount * 2.2 * PLUGIN_INSTRUMENT_GAIN_BOOST,
        );

        if (channelSettings.monoMode) {
          stopActiveChannelSynthVoices(channel.id, time);
        }

        const routeVoiceToOutput = function (voice, destinationNode) {
          if (!voice || !destinationNode) {
            return;
          }

          const candidateNodes = [
            voice,
            voice.output,
            voice.gain,
            voice.gainNode,
            voice.node,
          ].filter(Boolean);

          for (let index = 0; index < candidateNodes.length; index += 1) {
            const node = candidateNodes[index];
            if (
              typeof node.connect !== "function" ||
              typeof node.disconnect !== "function"
            ) {
              continue;
            }

            try {
              node.disconnect();
              node.connect(destinationNode);
              return;
            } catch {
              continue;
            }
          }
        };

        const voiceNode = instrument.play(transposedPitch, time, {
          duration: noteDuration,
          gain: noteGain,
          attack: attackSec,
          release: releaseSec,
          pan: Math.max(-1, Math.min(1, panValue)),
          destination: outputNode,
        });

        // Some soundfont implementations keep using their default destination.
        // Re-route the returned voice node explicitly to ensure mixer insert routing.
        routeVoiceToOutput(voiceNode, outputNode);

        if (!voiceNode || typeof voiceNode.stop !== "function") {
          return;
        }

        const channelVoices =
          activeSynthVoicesRef.current.get(channel.id) || new Set();
        if (!activeSynthVoicesRef.current.has(channel.id)) {
          activeSynthVoicesRef.current.set(channel.id, channelVoices);
        }

        const voice = { node: voiceNode };

        channelVoices.add(voice);

        const removeAfterMs = Math.max(
          40,
          Math.round((time - audioCtx.currentTime + noteDuration + 0.4) * 1000),
        );

        window.setTimeout(function () {
          channelVoices.delete(voice);
          if (channelVoices.size === 0) {
            activeSynthVoicesRef.current.delete(channel.id);
          }
        }, removeAfterMs);
      };

      const onSampleSettingsPreviewPlay = function (event) {
        const channelId = String(event?.detail?.channelId || "").trim();
        if (!channelId) {
          return;
        }

        const channel = (channelsRef.current || []).find(function (item) {
          return item.id === channelId;
        });
        if (!channel) {
          return;
        }

        const previewContext = ensureContext();
        if (previewContext.state === "suspended") {
          void previewContext.resume();
        }

        ensureMixerGraph();
        applyMixerSettingsToGraph();

        const outputNode = getInsertInputNodeForChannel(channel);
        const targetInsertId =
          String(channel.mixerInsertId || "master").trim() || "master";
        sampleSettingsPreviewMeterInsertIdRef.current = targetInsertId;

        const stopSampleSettingsPreviewMeterLoop = function () {
          if (sampleSettingsPreviewMeterRafRef.current) {
            cancelAnimationFrame(sampleSettingsPreviewMeterRafRef.current);
            sampleSettingsPreviewMeterRafRef.current = null;
          }
        };

        const startSampleSettingsPreviewMeterLoop = function () {
          if (transport.isPlaying) {
            return;
          }

          stopSampleSettingsPreviewMeterLoop();

          const tickPreviewMeters = function () {
            if (transport.isPlaying) {
              stopSampleSettingsPreviewMeterLoop();
              return;
            }

            const nowCtx = audioCtxRef.current || ensureContext();
            updateMixerMeters(nowCtx.currentTime);
            sampleSettingsPreviewMeterRafRef.current =
              requestAnimationFrame(tickPreviewMeters);
          };

          sampleSettingsPreviewMeterRafRef.current =
            requestAnimationFrame(tickPreviewMeters);
        };

        startSampleSettingsPreviewMeterLoop();

        const pluginRef = String(channel.pluginRef || "").trim();
        const plugin = getPluginInstrument(pluginRef);
        const hasPluginInstrument = Boolean(plugin && plugin.soundfont);

        const gainAmount =
          BASE_CHANNEL_TRIGGER_GAIN * clamp(Number(channel.volume ?? 1), 0, 1);

        const scheduleSampleSettingsPlugin = function () {
          const nowCtx = audioCtxRef.current || previewContext;
          const startAt = nowCtx.currentTime + 0.002;

          stopActiveChannelSamples(channel.id, startAt);
          stopActiveChannelSynthVoices(channel.id, startAt);

          schedulePluginInstrument(
            pluginRef,
            startAt,
            gainAmount,
            channel.pan,
            channel,
            outputNode,
            DEFAULT_SAMPLE_MIDI_PITCH,
            1,
            getSafeSampleSettings(channel.sampleSettings),
          );
        };

        const scheduleSampleSettingsSample = function (buffer) {
          if (!buffer) {
            return;
          }

          const nowCtx = audioCtxRef.current || previewContext;
          const startAt = nowCtx.currentTime + 0.002;

          stopActiveChannelSamples(channel.id, startAt);
          stopActiveChannelSynthVoices(channel.id, startAt);

          scheduleSample(
            buffer,
            startAt,
            gainAmount,
            channel.pan,
            channel,
            outputNode,
            DEFAULT_SAMPLE_MIDI_PITCH,
            1,
          );
        };

        if (hasPluginInstrument) {
          const key = getPluginInstrumentCacheKey(pluginRef, channel.id);
          const cachedInstrument = pluginInstrumentRef.current.get(key);
          if (cachedInstrument) {
            scheduleSampleSettingsPlugin();
            return;
          }

          void loadPluginInstrument(pluginRef, channel.id, outputNode).then(
            function (loadedInstrument) {
              if (!loadedInstrument) {
                return;
              }

              scheduleSampleSettingsPlugin();
            },
          );
          return;
        }

        const safeSampleRef = toSafeSampleUrl(channel.sampleRef);
        if (!safeSampleRef) {
          return;
        }

        const cached = sampleBufferCacheRef.current.get(safeSampleRef);
        if (cached) {
          scheduleSampleSettingsSample(cached);
          return;
        }

        if (!sampleLoadFailedRef.current.has(safeSampleRef)) {
          void loadSampleBuffer(safeSampleRef).then(
            scheduleSampleSettingsSample,
          );
        }
      };

      const onSampleSettingsPreviewStop = function (event) {
        const channelId = String(event?.detail?.channelId || "").trim();
        if (!channelId || !audioCtxRef.current) {
          return;
        }

        if (sampleSettingsPreviewMeterRafRef.current) {
          cancelAnimationFrame(sampleSettingsPreviewMeterRafRef.current);
          sampleSettingsPreviewMeterRafRef.current = null;
        }

        const stopAt = audioCtxRef.current.currentTime;
        stopActiveChannelSamples(channelId, stopAt);
        stopActiveChannelSynthVoices(channelId, stopAt);

        const insertId =
          sampleSettingsPreviewMeterInsertIdRef.current ||
          String(
            (channelsRef.current || []).find(function (item) {
              return item.id === channelId;
            })?.mixerInsertId || "master",
          );
        sampleSettingsPreviewMeterInsertIdRef.current = null;

        dispatch(
          setInsertMeter({
            insertId,
            meter: 0,
          }),
        );
        dispatch(
          setInsertMeter({
            insertId: "master",
            meter: 0,
          }),
        );
      };

      window.addEventListener(
        SAMPLE_SETTINGS_PREVIEW_PLAY_EVENT,
        onSampleSettingsPreviewPlay,
      );
      window.addEventListener(
        SAMPLE_SETTINGS_PREVIEW_STOP_EVENT,
        onSampleSettingsPreviewStop,
      );

      const removeSampleSettingsPreviewListeners = function () {
        if (sampleSettingsPreviewMeterRafRef.current) {
          cancelAnimationFrame(sampleSettingsPreviewMeterRafRef.current);
          sampleSettingsPreviewMeterRafRef.current = null;
        }

        window.removeEventListener(
          SAMPLE_SETTINGS_PREVIEW_PLAY_EVENT,
          onSampleSettingsPreviewPlay,
        );
        window.removeEventListener(
          SAMPLE_SETTINGS_PREVIEW_STOP_EVENT,
          onSampleSettingsPreviewStop,
        );
      };

      if (!transport.isPlaying) {
        if (audioCtxRef.current) {
          stopAllActiveSamples(audioCtxRef.current.currentTime);
        }

        stepRef.current = 0;
        const hasVisualTailContext = Boolean(
          audioCtxRef.current && mixerGraphRef.current,
        );
        if (!hasVisualTailContext) {
          if (rafIdRef.current) {
            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
          }
          resetMeters();
          stopVisualTailUntilRef.current = 0;
          return function () {
            removeSampleSettingsPreviewListeners();
          };
        }

        const nowPerf = performance.now();
        if (stopVisualTailUntilRef.current <= nowPerf) {
          const waveformTailDurationMs = 2500;
          stopVisualTailStartedAtRef.current = nowPerf;
          stopVisualTailUntilRef.current = nowPerf + waveformTailDurationMs;
          stopVisualTailStateRef.current = new Map();
          mixerSettingsRef.current.forEach(function (insert) {
            const insertId = insert.id;
            const outDb = Number(
              lastMaximizerOutputDbRef.current.get(insertId) || -96,
            );
            const stereo =
              lastMaximizerStereoMeterRef.current.get(insertId) || {
                leftVolumeDb: -96,
                leftReductionDb: 0,
                rightReductionDb: 0,
                rightVolumeDb: -96,
              };
            const lastWaveform = lastMeterWaveformRef.current.get(insertId);
            stopVisualTailStateRef.current.set(insertId, {
              meter: Number(lastMeterLevelsRef.current.get(insertId) || 0),
              reduction: Number(
                lastMaximizerReductionRef.current.get(insertId) || 0,
              ),
              outDb,
              stereo,
              initialMeter: Number(lastMeterLevelsRef.current.get(insertId) || 0),
              initialReduction: Number(
                lastMaximizerReductionRef.current.get(insertId) || 0,
              ),
              initialOutDb: outDb,
              initialLeftDb: Number(stereo.leftVolumeDb || -96),
              initialRightDb: Number(stereo.rightVolumeDb || -96),
              initialLeftReduction: Number(stereo.leftReductionDb || 0),
              initialRightReduction: Number(stereo.rightReductionDb || 0),
              waveform: Array.isArray(lastWaveform)
                ? lastWaveform.slice(0, 220)
                : Array.from({ length: 220 }).map(function () {
                    return 0;
                  }),
            });
          });
        }

        const tickStopVisuals = function () {
          const nowCtx = audioCtxRef.current;
          if (!nowCtx) {
            resetMeters();
            stopVisualTailUntilRef.current = 0;
            stopVisualTailStartedAtRef.current = 0;
            stopVisualTailStateRef.current.clear();
            rafIdRef.current = null;
            return;
          }

          const nowPerfTick = performance.now();
          const tailDuration = Math.max(
            1,
            stopVisualTailUntilRef.current - stopVisualTailStartedAtRef.current,
          );
          const waveformProgress = clamp(
            (nowPerfTick - stopVisualTailStartedAtRef.current) / tailDuration,
            0,
            1,
          );
          const barProgress = clamp(
            (nowPerfTick - stopVisualTailStartedAtRef.current) / 900,
            0,
            1,
          );
          const fade = 1 - barProgress;

          mixerSettingsRef.current.forEach(function (insert) {
            const state = stopVisualTailStateRef.current.get(insert.id);
            if (!state) {
              return;
            }
            state.meter = state.initialMeter * fade;
            state.reduction = state.initialReduction * fade;
            state.outDb =
              state.initialOutDb + (-96 - state.initialOutDb) * barProgress;
            state.stereo = {
              leftVolumeDb:
                state.initialLeftDb + (-96 - state.initialLeftDb) * barProgress,
              leftReductionDb: state.initialLeftReduction * fade,
              rightReductionDb: state.initialRightReduction * fade,
              rightVolumeDb:
                state.initialRightDb + (-96 - state.initialRightDb) * barProgress,
            };
            state.waveform = [0, 0].concat(state.waveform.slice(0, 218));

            dispatch(
              setInsertMeter({
                insertId: insert.id,
                meter: state.meter,
                waveform: state.waveform,
                maximizerReduction: state.reduction,
                maximizerOutputDb: state.outDb,
                maximizerStereoMeter: state.stereo,
              }),
            );
          });

          if (waveformProgress < 1) {
            rafIdRef.current = requestAnimationFrame(tickStopVisuals);
            return;
          }

          resetMeters();
          stopVisualTailUntilRef.current = 0;
          stopVisualTailStartedAtRef.current = 0;
          stopVisualTailStateRef.current.clear();
          rafIdRef.current = null;
        };

        if (!rafIdRef.current) {
          rafIdRef.current = requestAnimationFrame(tickStopVisuals);
        }

        return function () {
          removeSampleSettingsPreviewListeners();
          if (rafIdRef.current) {
            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
          }
        };
      }

      stopVisualTailUntilRef.current = 0;
      if (audioCtx.state === "suspended") {
        void audioCtx.resume();
      }

      ensureMixerGraph();
      applyMixerSettingsToGraph();

      const scheduleAhead = 0.11;

      const schedulePatternStep = function (
        pattern,
        patternStep,
        noteTime,
        options,
      ) {
        const currentChannels = channelsRef.current;
        const includeSustainFromStep = Boolean(options?.includeSustainFromStep);
        const sustainSourceStep = Math.max(
          0,
          Number(options?.sustainSourceStep ?? 0),
        );

        if (!pattern || !currentChannels) {
          return;
        }

        const patternLength = Math.max(1, pattern.lengthSteps || 16);
        const stepIndex =
          ((patternStep % patternLength) + patternLength) % patternLength;

        const soloChannels = currentChannels.filter(function (channel) {
          return channel.solo;
        });

        currentChannels.forEach(function (channel) {
          if (channel.muted) {
            return;
          }
          if (soloChannels.length > 0 && !channel.solo) {
            return;
          }

          const row = pattern.stepGrid[channel.id];
          const stepHit = Boolean(row && row[stepIndex]);

          const pianoNotes = pattern.pianoPreview?.[channel.id] || [];
          const noteHits = pianoNotes.reduce(function (acc, note) {
            const noteStart = Math.max(0, Number(note.start || 0));
            const noteLength = Math.max(0.0625, Number(note.length || 1));
            const noteEnd = noteStart + noteLength;
            const startStep = Math.floor(noteStart);
            if (startStep !== stepIndex) {
              if (!includeSustainFromStep) {
                return acc;
              }

              if (
                noteStart >= sustainSourceStep ||
                noteEnd <= sustainSourceStep
              ) {
                return acc;
              }

              acc.push({
                pitch: Math.round(note.pitch || DEFAULT_SAMPLE_MIDI_PITCH),
                velocity: Math.max(
                  1,
                  Math.min(
                    127,
                    Math.round(note.velocity || DEFAULT_NOTE_VELOCITY),
                  ),
                ),
                offsetSeconds: 0,
                lengthSteps: Math.max(0.0625, noteEnd - sustainSourceStep),
              });
              return acc;
            }

            const stepOffset = noteStart - startStep;
            acc.push({
              pitch: Math.round(note.pitch || DEFAULT_SAMPLE_MIDI_PITCH),
              velocity: Math.max(
                1,
                Math.min(
                  127,
                  Math.round(note.velocity || DEFAULT_NOTE_VELOCITY),
                ),
              ),
              offsetSeconds: Math.max(0, stepOffset * sixteenth),
              lengthSteps: noteLength,
            });
            return acc;
          }, []);

          if (!stepHit && noteHits.length === 0) {
            return;
          }

          const sampleRef = channel.sampleRef;
          const safeSampleRef = toSafeSampleUrl(sampleRef);
          const pluginRef = String(channel.pluginRef || "");
          const plugin = getPluginInstrument(pluginRef);
          const hasPluginInstrument = Boolean(plugin && plugin.soundfont);
          const channelSettings = getSafeSampleSettings(channel.sampleSettings);

          if (!safeSampleRef && !hasPluginInstrument) {
            return;
          }

          const outputNode = getInsertInputNodeForChannel(channel);
          const channelVolume = clamp(Number(channel.volume ?? 1), 0, 1);

          const playOneHit = function (
            midiPitch,
            offsetSeconds,
            lengthSteps,
            velocity,
          ) {
            const hitTime = noteTime + Math.max(0, Number(offsetSeconds || 0));
            const velocityScale = clamp(
              Number(velocity || DEFAULT_NOTE_VELOCITY) / 127,
              1 / 127,
              1,
            );
            const hitGain =
              BASE_CHANNEL_TRIGGER_GAIN * channelVolume * velocityScale;

            if (hasPluginInstrument) {
              schedulePluginInstrument(
                pluginRef,
                hitTime,
                hitGain,
                channel.pan,
                channel,
                outputNode,
                midiPitch,
                lengthSteps,
                channelSettings,
              );
              return;
            }

            const sampleBuffer =
              sampleBufferCacheRef.current.get(safeSampleRef);
            if (sampleBuffer) {
              scheduleSample(
                sampleBuffer,
                hitTime,
                hitGain,
                channel.pan,
                channel,
                outputNode,
                midiPitch,
                lengthSteps,
              );
              return;
            }

            if (!sampleLoadFailedRef.current.has(safeSampleRef)) {
              void loadSampleBuffer(safeSampleRef);
            }
          };

          if (stepHit) {
            playOneHit(DEFAULT_SAMPLE_MIDI_PITCH, 0, 1, DEFAULT_NOTE_VELOCITY);
          }

          noteHits.forEach(function (note) {
            playOneHit(
              note.pitch,
              note.offsetSeconds,
              note.lengthSteps,
              note.velocity,
            );
          });
        });
      };

      const getSongLengthInSteps = function () {
        const clips = playlistClipsRef.current || [];
        if (clips.length === 0) {
          return Math.max(1, activePatternRef.current?.lengthSteps || 16);
        }

        let maxSongStep = 16;
        clips.forEach(function (clip) {
          const clipStartStep = Math.max(
            0,
            Math.round((Number(clip.barStart || 1) - 1) * 16),
          );
          const clipLengthSteps = Math.max(
            1,
            Math.round(Number(clip.barLength || 1) * 16),
          );
          const clipEndStep = clipStartStep + clipLengthSteps;
          maxSongStep = Math.max(maxSongStep, clipEndStep);
        });

        return maxSongStep;
      };

      const scheduleSongStep = function (
        songStep,
        absoluteSongStep,
        songLengthSteps,
        noteTime,
      ) {
        const allPatterns = patternsRef.current || [];
        const clips = playlistClipsRef.current || [];
        if (clips.length === 0) {
          return;
        }

        const patternsById = allPatterns.reduce(function (acc, pattern) {
          acc[pattern.id] = pattern;
          return acc;
        }, {});

        clips.forEach(function (clip) {
          const clipType = String(clip.clipType || "pattern").toLowerCase();
          const isAudioClip =
            clipType === "audio" ||
            (String(clip.samplePath || "").trim().length > 0 &&
              String(clip.channelId || "").trim().length > 0);

          const pattern = patternsById[clip.patternId];
          const clipStartStep = Math.max(
            0,
            Math.round((Number(clip.barStart || 1) - 1) * 16),
          );
          const clipLengthSteps = Math.max(
            1,
            Math.round(Number(clip.barLength || 1) * 16),
          );
          const clipSourceOffsetSteps = Math.max(
            0,
            Number(clip.sourceOffsetSteps || 0),
          );
          const relativeStep = songStep - clipStartStep;

          if (relativeStep < 0 || relativeStep >= clipLengthSteps) {
            return;
          }

          if (isAudioClip) {
            const cycleIndex = Math.floor(absoluteSongStep / songLengthSteps);
            const absoluteClipStartStep =
              cycleIndex * songLengthSteps + clipStartStep;
            const alreadyScheduledAt = scheduledAudioClipStartRef.current.get(
              clip.id,
            );
            if (alreadyScheduledAt === absoluteClipStartStep) {
              return;
            }

            const clipChannel = (channelsRef.current || []).find(function (ch) {
              return ch.id === clip.channelId;
            });
            const samplePath = toSafeSampleUrl(
              clip.samplePath || clipChannel?.sampleRef,
            );
            if (!samplePath) {
              return;
            }

            const graph = mixerGraphRef.current;
            const outputNode = clipChannel
              ? getInsertInputNodeForChannel(clipChannel)
              : graph?.inserts?.get("master")?.inputGain ||
                audioCtx.destination;
            const audioClipBuffer =
              sampleBufferCacheRef.current.get(samplePath);

            if (audioClipBuffer) {
              schedulePlaylistAudioClip(
                audioClipBuffer,
                noteTime,
                outputNode,
                clipLengthSteps,
                clipSourceOffsetSteps + relativeStep,
                clipChannel,
              );
              scheduledAudioClipStartRef.current.set(
                clip.id,
                absoluteClipStartStep,
              );
            } else if (!sampleLoadFailedRef.current.has(samplePath)) {
              void loadSampleBuffer(samplePath);
            }

            return;
          }

          if (!pattern) {
            return;
          }

          const patternLength = Math.max(1, pattern.lengthSteps || 16);
          const patternStepWithOffset =
            Math.round(clipSourceOffsetSteps) + relativeStep;
          if (patternStepWithOffset >= patternLength) {
            return;
          }

          schedulePatternStep(pattern, patternStepWithOffset, noteTime, {
            includeSustainFromStep:
              relativeStep === 0 && clipSourceOffsetSteps > 0,
            sustainSourceStep: patternStepWithOffset,
          });
        });
      };

      nextNoteTimeRef.current = audioCtx.currentTime + 0.02;
      const playbackCycleLength =
        transportModeRef.current === "song"
          ? Math.max(1, getSongLengthInSteps())
          : Math.max(1, activePatternRef.current?.lengthSteps || 16);
      const requestedStartStep = Math.max(
        0,
        Math.round(Number(transport.currentStep16 || 0)),
      );
      if (transportModeRef.current === "song") {
        if (songLoopEnabledRef.current) {
          stepRef.current = requestedStartStep % playbackCycleLength;
        } else {
          stepRef.current = Math.min(
            playbackCycleLength - 1,
            requestedStartStep,
          );
        }
      } else {
        stepRef.current = requestedStartStep % playbackCycleLength;
      }
      startedAtRef.current =
        nextNoteTimeRef.current - stepRef.current * sixteenth;
      scheduledAudioClipStartRef.current.clear();

      const tick = function () {
        const now = audioCtx.currentTime;
        const transportMode = transportModeRef.current;
        const songLoopEnabled = songLoopEnabledRef.current;
        let reachedSongEnd = false;

        applyMixerSettingsToGraph();
        updateMixerMeters(now);

        while (nextNoteTimeRef.current < now + scheduleAhead) {
          if (transportMode === "song") {
            const songLength = Math.max(1, getSongLengthInSteps());
            if (!songLoopEnabled && stepRef.current >= songLength) {
              reachedSongEnd = true;
              break;
            }

            const currentSongStep = songLoopEnabled
              ? stepRef.current % songLength
              : stepRef.current;
            scheduleSongStep(
              currentSongStep,
              stepRef.current,
              songLength,
              nextNoteTimeRef.current,
            );
          } else {
            const patternLength = Math.max(
              1,
              activePatternRef.current?.lengthSteps || 16,
            );
            const currentStep = stepRef.current % patternLength;
            schedulePatternStep(
              activePatternRef.current,
              currentStep,
              nextNoteTimeRef.current,
            );
          }

          stepRef.current += 1;
          nextNoteTimeRef.current += sixteenth;
        }

        if (reachedSongEnd) {
          dispatch(setPlayheadStep(Math.max(0, getSongLengthInSteps() - 1)));
          dispatch(setPlaying(false));
          return;
        }

        const elapsed = now - startedAtRef.current;
        const uiLength =
          transportMode === "song"
            ? Math.max(1, getSongLengthInSteps())
            : Math.max(1, activePatternRef.current?.lengthSteps || 16);
        const elapsedSteps = Math.floor(elapsed / sixteenth);
        const uiStep =
          transportMode === "song"
            ? songLoopEnabled
              ? elapsedSteps % uiLength
              : Math.min(uiLength - 1, Math.max(0, elapsedSteps))
            : elapsedSteps % uiLength;
        dispatch(setPlayheadStep(uiStep));

        rafIdRef.current = requestAnimationFrame(tick);
      };

      rafIdRef.current = requestAnimationFrame(tick);

      return function () {
        removeSampleSettingsPreviewListeners();

        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
      };
    },
    [
      transport.isPlaying,
      transport.bpm,
      dispatch,
      applyMixerSettingsToGraph,
      ensureContext,
      ensureMixerGraph,
      getInsertInputNodeForChannel,
      loadSampleBuffer,
      loadPluginInstrument,
    ],
  );
}

