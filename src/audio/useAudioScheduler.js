import { useCallback, useEffect, useRef } from "react";
import Soundfont from "soundfont-player";
import { useDispatch, useSelector } from "react-redux";
import { getPluginInstrument } from "../data/pluginInstruments";
import { setInsertMeter, setPlayheadStep } from "../store";

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
};

const DEFAULT_SAMPLE_MIDI_PITCH = 72;
const PLUGIN_INSTRUMENT_GAIN_BOOST = 1.5;
const MIXER_METER_RMS_GAIN = 4.2;
const MIXER_METER_PEAK_GAIN = 1.9;
const MIXER_METER_NOISE_GATE = 0.0016;
const MIXER_METER_RESPONSE_CURVE = 0.5;
const MIXER_METER_DECAY = 0.9;
const EQ_SPECTRUM_BINS = 112;
const EQ_SPECTRUM_MIN_FREQ = 20;
const EQ_SPECTRUM_MAX_FREQ = 20000;
const FX_EFFECT_GRAPHIC_EQ = "graphic-eq";
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

function toSafeSampleUrl(rawPath) {
  const input = String(rawPath || "").trim();
  if (!input) {
    return "";
  }

  const hashIndex = input.indexOf("#");
  const pathWithoutHash = hashIndex >= 0 ? input.slice(0, hashIndex) : input;
  const parts = pathWithoutHash.split("/");

  const encoded = parts.map(function (part, index) {
    if (index === 0 && part === "") {
      return "";
    }

    try {
      return encodeURIComponent(decodeURIComponent(part));
    } catch {
      return encodeURIComponent(part);
    }
  });

  return encoded.join("/");
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

function getCombinedGraphicEqState(insert) {
  const fxSlots = Array.isArray(insert?.fxSlots) ? insert.fxSlots : [];
  const enabledSlots = fxSlots.filter(function (slot) {
    return Boolean(slot?.enabled) && slot?.effectType === FX_EFFECT_GRAPHIC_EQ;
  });

  if (enabledSlots.length === 0) {
    return {
      enabled: false,
      params: getSafeGraphicEqParams(null),
    };
  }

  return {
    enabled: true,
    params: getSafeGraphicEqParams(
      enabledSlots[enabledSlots.length - 1]?.params,
    ),
  };
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
  };

  const fadeTotal = next.fadeInPct + next.fadeOutPct;
  if (fadeTotal > 98) {
    const scale = 98 / fadeTotal;
    next.fadeInPct = Math.max(0, Math.round(next.fadeInPct * scale));
    next.fadeOutPct = Math.max(0, Math.round(next.fadeOutPct * scale));
  }

  return next;
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
  const activeSampleVoicesRef = useRef(new Map());
  const activeSynthVoicesRef = useRef(new Map());
  const pluginInstrumentRef = useRef(new Map());
  const pluginInstrumentLoadRef = useRef(new Map());
  const pluginInstrumentFailedRef = useRef(new Set());
  const channelsRef = useRef(channels);
  const activePatternRef = useRef(activePattern);
  const patternsRef = useRef(patterns);
  const playlistClipsRef = useRef(playlistClips);
  const transportModeRef = useRef(transport.mode);
  const scheduledAudioClipStartRef = useRef(new Map());
  const mixerSettingsRef = useRef(mixerSettings);
  const mixerGraphRef = useRef(null);
  const lastMeterDispatchAtRef = useRef(0);
  const lastMeterLevelsRef = useRef(new Map());
  const lastMeterSpectrumRef = useRef(new Map());
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
        const outputGain = audioCtx.createGain();
        const analyser = audioCtx.createAnalyser();

        analyser.fftSize = 2048;
        analyser.minDecibels = -96;
        analyser.maxDecibels = -12;
        analyser.smoothingTimeConstant = 0.58;

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
          outputGain,
          analyser,
          meterData: new Uint8Array(analyser.fftSize),
          spectrumData: new Uint8Array(analyser.frequencyBinCount),
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
      const eqState = getCombinedGraphicEqState(insert);
      const eqEnabled = eqState.enabled;
      const eqParams = eqState.params;

      const width = 1 - targetSeparation;
      const directGain = 0.5 * (1 + width);
      const crossGain = 0.5 * (1 - width);

      node.leftToLeft.gain.setValueAtTime(directGain, now);
      node.rightToRight.gain.setValueAtTime(directGain, now);
      node.rightToLeft.gain.setValueAtTime(crossGain, now);
      node.leftToRight.gain.setValueAtTime(crossGain, now);

      node.panner.pan.setValueAtTime(targetPan, now);

      smoothTo(node.fxDryGain.gain, eqEnabled ? 0 : 1, now);
      smoothTo(node.fxWetGain.gain, eqEnabled ? 1 : 0, now);
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
            const nowGain = Math.max(0.0001, voice.gain.gain.value || 0.0001);
            voice.gain.gain.cancelScheduledValues(atTime);
            voice.gain.gain.setValueAtTime(nowGain, atTime);
            voice.gain.gain.linearRampToValueAtTime(0.0001, atTime + 0.01);
            voice.source.stop(atTime + 0.012);
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
            }),
          );
        });

        lastMeterLevelsRef.current.clear();
        lastMeterSpectrumRef.current.clear();
      };

      const updateMixerMeters = function (now) {
        if (now - lastMeterDispatchAtRef.current < 1 / 30) {
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

          const meterChanged =
            prevMeter === undefined ||
            Math.abs(prevMeter - node.meterLevel) > 0.018 ||
            (node.meterLevel < 0.01 && prevMeter >= 0.01);

          if (meterChanged || spectrumChanged) {
            lastMeterLevelsRef.current.set(insertId, node.meterLevel);
            if (isSpectrumTarget && nextSpectrum) {
              lastMeterSpectrumRef.current.set(insertId, nextSpectrum);
            }

            dispatch(
              setInsertMeter({
                insertId,
                meter: node.meterLevel,
                spectrum:
                  isSpectrumTarget && nextSpectrum ? nextSpectrum : undefined,
              }),
            );
          }
        });
      };

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
        const playbackRate = Math.max(
          0.125,
          Math.min(8, midiPitchToPlaybackRate(safeMidiPitch) * pitchRate),
        );

        if (settings.cutItself) {
          stopActiveChannelSamples(channel.id, time);
        }

        const sampleReadDuration = Math.max(
          0.01,
          sampleBuffer.duration * (settings.lengthPct / 100),
        );
        const samplePlayableDuration = Math.max(
          0.01,
          sampleReadDuration / playbackRate,
        );
        const noteGateDuration = Math.max(
          0.01,
          Number(noteLengthSteps || 1) * sixteenth,
        );
        const envReleaseSec = settings.envEnabled
          ? Math.max(0, Number(settings.envReleaseMs ?? 0) / 1000)
          : 0;
        const sourcePlayDuration = settings.envEnabled
          ? Math.max(
              0.01,
              Math.min(
                samplePlayableDuration,
                noteGateDuration + envReleaseSec,
              ),
            )
          : samplePlayableDuration;
        const envelopeGateDuration = settings.envEnabled
          ? Math.max(0.01, Math.min(noteGateDuration, sourcePlayDuration))
          : sourcePlayDuration;
        const fadeInSec = sourcePlayDuration * (settings.fadeInPct / 100);
        const fadeOutSec = sourcePlayDuration * (settings.fadeOutPct / 100);
        const fadeTotal = fadeInSec + fadeOutSec;
        const fadeScale =
          fadeTotal > sourcePlayDuration * 0.98
            ? (sourcePlayDuration * 0.98) / fadeTotal
            : 1;
        const finalFadeIn = fadeInSec * fadeScale;
        const finalFadeOut = fadeOutSec * fadeScale;
        const finalGain = Math.max(0.001, gainAmount * getNormalizeGain());
        const sampleStopAt = time + sourcePlayDuration;
        const fadeOutStart = Math.max(time, sampleStopAt - finalFadeOut);

        source.buffer = sampleBuffer;
        source.playbackRate.setValueAtTime(playbackRate, time);
        if (finalFadeIn > 0.001) {
          gain.gain.setValueAtTime(0.0001, time);
          gain.gain.linearRampToValueAtTime(finalGain, time + finalFadeIn);
        } else {
          gain.gain.setValueAtTime(finalGain, time);
        }

        gain.gain.setValueAtTime(finalGain, fadeOutStart);
        if (finalFadeOut > 0.001) {
          gain.gain.linearRampToValueAtTime(0.0001, sampleStopAt);
        } else {
          gain.gain.setValueAtTime(0.0001, sampleStopAt);
        }

        panner.pan.setValueAtTime(Math.max(-1, Math.min(1, panValue)), time);

        source.connect(gain);
        gain.connect(envelopeGain);
        if (settings.envEnabled) {
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
          Math.min(
            sampleReadDuration,
            sampleBuffer.duration,
            sourcePlayDuration * playbackRate,
          ),
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
          0.03,
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

      if (!transport.isPlaying) {
        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }

        if (audioCtxRef.current) {
          stopAllActiveSamples(audioCtxRef.current.currentTime);
        }

        resetMeters();

        stepRef.current = 0;
        return;
      }

      const audioCtx = ensureContext();
      if (audioCtx.state === "suspended") {
        void audioCtx.resume();
      }

      ensureMixerGraph();
      applyMixerSettingsToGraph();

      const sixteenth = 60 / transport.bpm / 4;
      const scheduleAhead = 0.11;

      const schedulePatternStep = function (pattern, patternStep, noteTime) {
        const currentChannels = channelsRef.current;

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
            const startStep = Math.floor(noteStart);
            if (startStep !== stepIndex) {
              return acc;
            }

            const stepOffset = noteStart - startStep;
            acc.push({
              pitch: Math.round(note.pitch || DEFAULT_SAMPLE_MIDI_PITCH),
              offsetSeconds: Math.max(0, stepOffset * sixteenth),
              lengthSteps: Math.max(0.0625, Number(note.length || 1)),
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

          const playOneHit = function (midiPitch, offsetSeconds, lengthSteps) {
            const hitTime = noteTime + Math.max(0, Number(offsetSeconds || 0));

            if (hasPluginInstrument) {
              schedulePluginInstrument(
                pluginRef,
                hitTime,
                0.16 * channel.volume,
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
                0.2 * channel.volume,
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
            playOneHit(DEFAULT_SAMPLE_MIDI_PITCH, 0, 1);
          }

          noteHits.forEach(function (note) {
            playOneHit(note.pitch, note.offsetSeconds, note.lengthSteps);
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
                relativeStep,
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
          if (relativeStep >= patternLength) {
            return;
          }

          schedulePatternStep(pattern, relativeStep, noteTime);
        });
      };

      nextNoteTimeRef.current = audioCtx.currentTime + 0.02;
      startedAtRef.current = nextNoteTimeRef.current;
      stepRef.current = 0;
      scheduledAudioClipStartRef.current.clear();

      const tick = function () {
        const now = audioCtx.currentTime;
        const transportMode = transportModeRef.current;

        applyMixerSettingsToGraph();
        updateMixerMeters(now);

        while (nextNoteTimeRef.current < now + scheduleAhead) {
          if (transportMode === "song") {
            const songLength = Math.max(1, getSongLengthInSteps());
            const currentSongStep = stepRef.current % songLength;
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

        const elapsed = now - startedAtRef.current;
        const uiLength =
          transportMode === "song"
            ? Math.max(1, getSongLengthInSteps())
            : Math.max(1, activePatternRef.current?.lengthSteps || 16);
        const uiStep = Math.floor(elapsed / sixteenth) % uiLength;
        dispatch(setPlayheadStep(uiStep));

        rafIdRef.current = requestAnimationFrame(tick);
      };

      rafIdRef.current = requestAnimationFrame(tick);

      return function () {
        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }

        resetMeters();
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
