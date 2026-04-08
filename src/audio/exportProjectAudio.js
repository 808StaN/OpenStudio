import Soundfont from "soundfont-player";
import { getPluginInstrument } from "../data/pluginInstruments";
import { toSafeSampleUrl } from "../utils/sampleUrl";

const DEFAULT_SAMPLE_MIDI_PITCH = 72;
const DEFAULT_NOTE_VELOCITY = 95;
const PLUGIN_INSTRUMENT_GAIN_BOOST = 1.5;
const BASE_CHANNEL_TRIGGER_GAIN = 0.75;
const CUT_ITSELF_RELEASE_SEC = 0.01;
const CUT_ITSELF_MAX_RETRIGGER_RELEASE_SEC = 0.016;
const CUT_ITSELF_STOP_PADDING_SEC = 0.003;
const CUT_ITSELF_RETRIGGER_FADE_IN_SEC = 0.0025;
const FX_EFFECT_GRAPHIC_EQ = "graphic-eq";
const FX_EFFECT_REVERB = "reverb";
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
  attackMs: 8,
  releaseMs: 420,
  pitchCents: 0,
  monoMode: false,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function scheduleSmoothGainStop(param, atTime, releaseSec) {
  const safeReleaseSec = Math.max(0.003, Number(releaseSec || 0));
  const stopAt = atTime + safeReleaseSec;
  const tau = Math.max(0.001, safeReleaseSec * 0.25);

  if (typeof param.cancelAndHoldAtTime === "function") {
    param.cancelAndHoldAtTime(atTime);
    const heldGain = Math.max(0.0001, Number(param.value || 0));
    param.setValueAtTime(heldGain, atTime);
  } else {
    const nowGain = Math.max(0.0001, Number(param.value || 0));
    param.cancelScheduledValues(atTime);
    param.setValueAtTime(nowGain, atTime);
  }

  param.setTargetAtTime(0.0001, atTime, tau);
  return stopAt;
}

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

function getActiveFxState(insert) {
  const fxSlots = Array.isArray(insert?.fxSlots) ? insert.fxSlots : [];
  const enabledSlots = fxSlots.filter(function (slot) {
    return Boolean(slot?.enabled);
  });

  if (enabledSlots.length === 0) {
    return {
      effectType: "none",
      params: null,
    };
  }

  const activeSlot = enabledSlots[enabledSlots.length - 1];
  const effectType = String(activeSlot?.effectType || "none");

  if (effectType === FX_EFFECT_GRAPHIC_EQ) {
    return {
      effectType,
      params: getSafeGraphicEqParams(activeSlot?.params),
    };
  }

  if (effectType === FX_EFFECT_REVERB) {
    return {
      effectType,
      params: getSafeReverbParams(activeSlot?.params),
    };
  }

  return {
    effectType: "none",
    params: null,
  };
}

function midiPitchToPlaybackRate(midiPitch) {
  const semitoneOffset = midiPitch - DEFAULT_SAMPLE_MIDI_PITCH;
  const rawRate = Math.pow(2, semitoneOffset / 12);
  return Math.max(0.125, Math.min(8, rawRate));
}

function getSafeSampleSettings(raw) {
  const hasPitchCents = Object.hasOwn(raw || {}, "pitchCents");
  const base = {
    ...defaultSampleSettings,
    attackMs: 8,
    releaseMs: 420,
    pitchCents: hasPitchCents
      ? Number(raw?.pitchCents)
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

function buildInsertInputNodes(audioCtx, mixerInserts) {
  const inserts = Array.isArray(mixerInserts) ? mixerInserts : [];
  const insertMap = new Map();

  inserts.forEach(function (insert) {
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
    const outputGain = audioCtx.createGain();

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

    const reverbModulators = [reverbLateLeftDelay, reverbLateRightDelay].map(
      function (targetDelay, index) {
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
      },
    );

    fxDryGain.connect(outputGain);
    fxWetGain.connect(outputGain);

    insertMap.set(insert.id, {
      inputGain,
      leftToLeft,
      rightToLeft,
      leftToRight,
      rightToRight,
      panner,
      fxDryGain,
      fxWetGain,
      eqLowCut,
      eqBands,
      reverbInput,
      reverbPreDelay,
      reverbLoCut,
      reverbHiCut,
      reverbEarlyGain,
      reverbEarlyTaps,
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
      reverbModulators,
      reverbWetGain,
      outputGain,
    });
  });

  inserts.forEach(function (insert) {
    const node = insertMap.get(insert.id);
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
      const target = insertMap.get(targetId);
      if (!target) {
        return;
      }
      node.outputGain.connect(target.inputGain);
      hasConnectedRoute = true;
    });

    if (insert.isMaster || !hasConnectedRoute) {
      node.outputGain.connect(audioCtx.destination);
    }
  });

  inserts.forEach(function (insert) {
    const node = insertMap.get(insert.id);
    if (!node) {
      return;
    }

    const targetFader = insert.active
      ? Math.max(0, Math.min(1.25, Number(insert.fader ?? 1)))
      : 0;
    const targetPan = Math.max(-1, Math.min(1, Number(insert.pan || 0)));
    const targetSeparation = Math.max(
      -1,
      Math.min(1, Number(insert.stereoSeparation || 0)),
    );
    const activeFx = getActiveFxState(insert);
    const eqEnabled = activeFx.effectType === FX_EFFECT_GRAPHIC_EQ;
    const reverbEnabled = activeFx.effectType === FX_EFFECT_REVERB;
    const eqParams = eqEnabled ? activeFx.params : getSafeGraphicEqParams(null);
    const reverbParams = reverbEnabled
      ? activeFx.params
      : getSafeReverbParams(null);

    const width = 1 - targetSeparation;
    const directGain = 0.5 * (1 + width);
    const crossGain = 0.5 * (1 - width);

    node.leftToLeft.gain.setValueAtTime(directGain, 0);
    node.rightToRight.gain.setValueAtTime(directGain, 0);
    node.rightToLeft.gain.setValueAtTime(crossGain, 0);
    node.leftToRight.gain.setValueAtTime(crossGain, 0);
    node.panner.pan.setValueAtTime(targetPan, 0);

    const dryMix = reverbEnabled
      ? clamp(1 - reverbParams.dryWet, 0, 1)
      : eqEnabled
        ? 0
        : 1;
    const wetMix = reverbEnabled
      ? clamp(reverbParams.dryWet, 0, 1)
      : eqEnabled
        ? 1
        : 0;

    node.fxDryGain.gain.setValueAtTime(dryMix, 0);
    node.fxWetGain.gain.setValueAtTime(wetMix, 0);
    node.eqLowCut.frequency.setValueAtTime(20, 0);
    node.eqLowCut.Q.setValueAtTime(0.707, 0);

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
        bandNode.frequency.setValueAtTime(point.frequencyHz, 0);
        bandNode.Q.setValueAtTime(point.q, 0);
        bandNode.gain.setValueAtTime(eqEnabled ? point.gainDb : 0, 0);
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
    const loCutHz = reverbEnabled ? clamp(reverbParams.loCutHz, 20, 1200) : 130;
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

    const leftBaseDelay = 0.029 + reverbSize * 0.053 + reverbDiffusion * 0.011;
    const rightBaseDelay = 0.037 + reverbSize * 0.061 + reverbDiffusion * 0.013;
    const feedbackBase = isFreeze
      ? 0.988
      : clamp(
          0.24 + reverbDecay / 34 + reverbSize * 0.14 + reverbDiffusion * 0.1,
          0.2,
          0.82,
        );
    const earlyLevel = isFreeze ? 0 : earlyMix;
    const reverbInputLevel = isFreeze ? 0 : 1;
    const dampFreq = Math.max(900, hiCutHz * (1 - reverbDamping * 0.55));
    const directWidth = 0.5 * (1 + widthValue);
    const crossWidth = 0.5 * (1 - widthValue);

    node.reverbInput.gain.setValueAtTime(reverbInputLevel, 0);
    node.reverbPreDelay.delayTime.setValueAtTime(preDelaySec, 0);
    node.reverbLoCut.frequency.setValueAtTime(loCutHz, 0);
    node.reverbLoCut.Q.setValueAtTime(0.707, 0);
    node.reverbHiCut.frequency.setValueAtTime(hiCutHz, 0);
    node.reverbHiCut.Q.setValueAtTime(0.62, 0);
    node.reverbLateLeftDelay.delayTime.setValueAtTime(leftBaseDelay, 0);
    node.reverbLateRightDelay.delayTime.setValueAtTime(rightBaseDelay, 0);
    node.reverbLeftFeedback.gain.setValueAtTime(feedbackBase, 0);
    node.reverbRightFeedback.gain.setValueAtTime(feedbackBase * 0.985, 0);
    node.reverbLeftDamping.frequency.setValueAtTime(dampFreq, 0);
    node.reverbRightDamping.frequency.setValueAtTime(dampFreq * 0.96, 0);
    node.reverbLeftDamping.Q.setValueAtTime(0.68, 0);
    node.reverbRightDamping.Q.setValueAtTime(0.68, 0);
    node.reverbEarlyGain.gain.setValueAtTime(earlyLevel, 0);

    if (Array.isArray(node.reverbEarlyTaps)) {
      node.reverbEarlyTaps.forEach(function (tap, tapIndex) {
        const spread = reverbSize * 0.018 + reverbDiffusion * 0.011;
        const base = Number(tap.baseTime || 0.012);
        tap.delay.delayTime.setValueAtTime(base + spread, 0);
        const tapBaseGain = [0.5, 0.36, 0.26, 0.2][tapIndex] || 0.2;
        tap.gain.gain.setValueAtTime(tapBaseGain * earlyLevel, 0);
      });
    }

    node.reverbLeftToLeft.gain.setValueAtTime(directWidth, 0);
    node.reverbRightToRight.gain.setValueAtTime(directWidth, 0);
    node.reverbRightToLeft.gain.setValueAtTime(crossWidth, 0);
    node.reverbLeftToRight.gain.setValueAtTime(crossWidth, 0);
    node.reverbWetGain.gain.setValueAtTime(reverbEnabled ? 1 : 0, 0);

    if (Array.isArray(node.reverbModulators)) {
      node.reverbModulators.forEach(function (modNode, index) {
        modNode.lfo.frequency.setValueAtTime(
          modRate * (index === 0 ? 1 : 1.17),
          0,
        );
        modNode.depth.gain.setValueAtTime(
          (0.0004 + modDepth * 0.0032) * (index === 0 ? 1 : -1),
          0,
        );
      });
    }

    node.outputGain.gain.setValueAtTime(targetFader, 0);
  });

  const masterNode =
    insertMap.get("master") ||
    inserts
      .filter(function (insert) {
        return insert?.isMaster;
      })
      .map(function (insert) {
        return insertMap.get(insert.id);
      })
      .find(Boolean) ||
    null;

  const fallbackInsertInput =
    inserts
      .filter(function (insert) {
        return !insert?.isMaster;
      })
      .map(function (insert) {
        return insertMap.get(insert.id)?.inputGain;
      })
      .find(Boolean) ||
    masterNode?.inputGain ||
    audioCtx.destination;

  return {
    insertMap,
    masterInput: masterNode?.inputGain || audioCtx.destination,
    fallbackInsertInput,
  };
}

function getSongLengthInSteps(project) {
  const patterns = Array.isArray(project?.patterns) ? project.patterns : [];
  const patternsById = patterns.reduce(function (acc, pattern) {
    acc[pattern.id] = pattern;
    return acc;
  }, {});
  const clips = Array.isArray(project?.playlistClips)
    ? project.playlistClips
    : [];

  if (clips.length === 0) {
    const fallbackPattern = patterns.find(Boolean);
    return Math.max(1, Number(fallbackPattern?.lengthSteps || 16));
  }

  let maxSongStep = 16;
  clips.forEach(function (clip) {
    const pattern = patternsById[clip.patternId];
    const clipStartStep = Math.max(
      0,
      Math.round((Number(clip.barStart || 1) - 1) * 16),
    );
    const clipLengthSteps = Math.max(
      1,
      Math.round(Number(clip.barLength || 1) * 16),
    );
    const patternLengthSteps = Math.max(1, Number(pattern?.lengthSteps || 16));
    const effectiveLength = Math.min(clipLengthSteps, patternLengthSteps);
    maxSongStep = Math.max(maxSongStep, clipStartStep + effectiveLength);
  });

  return maxSongStep;
}

function collectEvents(project) {
  const channels = Array.isArray(project?.channels) ? project.channels : [];
  const patterns = Array.isArray(project?.patterns) ? project.patterns : [];
  const clips = Array.isArray(project?.playlistClips)
    ? project.playlistClips
    : [];

  const patternsById = patterns.reduce(function (acc, pattern) {
    acc[pattern.id] = pattern;
    return acc;
  }, {});

  const soloChannels = channels.filter(function (channel) {
    return Boolean(channel?.solo);
  });

  const events = [];

  clips.forEach(function (clip) {
    const pattern = patternsById[clip.patternId];
    if (!pattern) {
      return;
    }

    const clipStartStep = Math.max(
      0,
      Math.round((Number(clip.barStart || 1) - 1) * 16),
    );
    const clipLengthSteps = Math.max(
      1,
      Math.round(Number(clip.barLength || 1) * 16),
    );
    const patternLength = Math.max(1, Number(pattern.lengthSteps || 16));
    const maxSteps = Math.min(clipLengthSteps, patternLength);

    channels.forEach(function (channel) {
      if (!channel || channel.muted) {
        return;
      }
      if (soloChannels.length > 0 && !channel.solo) {
        return;
      }

      const row = pattern.stepGrid?.[channel.id] || [];
      for (let stepIndex = 0; stepIndex < maxSteps; stepIndex += 1) {
        if (!row[stepIndex]) {
          continue;
        }

        events.push({
          channel,
          midiPitch: DEFAULT_SAMPLE_MIDI_PITCH,
          velocity: DEFAULT_NOTE_VELOCITY,
          offsetSteps: clipStartStep + stepIndex,
          lengthSteps: 1,
        });
      }

      const pianoNotes = pattern.pianoPreview?.[channel.id] || [];
      pianoNotes.forEach(function (note) {
        const noteStart = Math.max(0, Number(note.start || 0));
        if (noteStart >= maxSteps) {
          return;
        }

        events.push({
          channel,
          midiPitch: clamp(
            Math.round(Number(note.pitch || DEFAULT_SAMPLE_MIDI_PITCH)),
            0,
            127,
          ),
          velocity: clamp(
            Math.round(Number(note.velocity || DEFAULT_NOTE_VELOCITY)),
            1,
            127,
          ),
          offsetSteps: clipStartStep + noteStart,
          lengthSteps: Math.max(0.0625, Number(note.length || 1)),
        });
      });
    });
  });

  events.sort(function (a, b) {
    return a.offsetSteps - b.offsetSteps;
  });

  return events;
}

function floatTo16BitPCM(input) {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const sample = clamp(input[i], -1, 1);
    output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output;
}

function writeString(view, offset, value) {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

function getSafeWavEncoding(requestedBitDepth) {
  const bitDepth = Math.round(Number(requestedBitDepth || 32));

  if (bitDepth === 16) {
    return {
      bitDepth: 16,
      audioFormat: 1,
      label: "16Bit int",
    };
  }

  if (bitDepth === 24) {
    return {
      bitDepth: 24,
      audioFormat: 1,
      label: "24Bit int",
    };
  }

  return {
    bitDepth: 32,
    audioFormat: 3,
    label: "32Bit float",
  };
}

function audioBufferToWavBlob(audioBuffer, requestedBitDepth) {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const wavEncoding = getSafeWavEncoding(requestedBitDepth);
  const format = wavEncoding.audioFormat;
  const bitDepth = wavEncoding.bitDepth;
  const bytesPerSample = bitDepth / 8;

  const channelData = Array.from({ length: numChannels }).map(
    function (_, index) {
      return audioBuffer.getChannelData(index);
    },
  );

  const length = channelData[0].length;
  const interleaved = new Float32Array(length * numChannels);

  for (let i = 0; i < length; i += 1) {
    for (let channel = 0; channel < numChannels; channel += 1) {
      interleaved[i * numChannels + channel] = channelData[channel][i];
    }
  }

  const blockAlign = (numChannels * bitDepth) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = interleaved.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < interleaved.length; i += 1) {
    const sample = clamp(interleaved[i], -1, 1);

    if (bitDepth === 16) {
      const int16Sample = Math.round(
        sample < 0 ? sample * 0x8000 : sample * 0x7fff,
      );
      view.setInt16(offset, int16Sample, true);
      offset += 2;
      continue;
    }

    if (bitDepth === 24) {
      let int24Sample = Math.round(
        sample < 0 ? sample * 0x800000 : sample * 0x7fffff,
      );
      int24Sample = Math.max(-0x800000, Math.min(0x7fffff, int24Sample));

      if (int24Sample < 0) {
        int24Sample += 0x1000000;
      }

      view.setUint8(offset, int24Sample & 0xff);
      view.setUint8(offset + 1, (int24Sample >> 8) & 0xff);
      view.setUint8(offset + 2, (int24Sample >> 16) & 0xff);
      offset += 3;
      continue;
    }

    view.setFloat32(offset, sample, true);
    offset += 4;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

async function audioBufferToMp3Blob(audioBuffer, requestedBitrateKbps) {
  const lamejsModule = await import("@breezystack/lamejs");
  const lamejs = lamejsModule?.default || lamejsModule;
  const Mp3Encoder = lamejs.Mp3Encoder;

  const bitrateKbps = clamp(Math.round(requestedBitrateKbps), 96, 320);

  const sampleRate = audioBuffer.sampleRate;
  const leftData = audioBuffer.getChannelData(0);
  const rightData =
    audioBuffer.numberOfChannels > 1
      ? audioBuffer.getChannelData(1)
      : audioBuffer.getChannelData(0);

  const left = floatTo16BitPCM(leftData);
  const right = floatTo16BitPCM(rightData);

  const encoder = new Mp3Encoder(2, sampleRate, bitrateKbps);
  const chunkSize = 1152;
  const mp3Data = [];

  for (let i = 0; i < left.length; i += chunkSize) {
    const leftChunk = left.subarray(i, i + chunkSize);
    const rightChunk = right.subarray(i, i + chunkSize);
    const mp3buf = encoder.encodeBuffer(leftChunk, rightChunk);
    if (mp3buf.length > 0) {
      mp3Data.push(new Uint8Array(mp3buf));
    }
  }

  const endBuf = encoder.flush();
  if (endBuf.length > 0) {
    mp3Data.push(new Uint8Array(endBuf));
  }

  return new Blob(mp3Data, { type: "audio/mpeg" });
}

function triggerBrowserDownload(blob, fileName) {
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(downloadUrl);
}

export async function renderPlaylistArrangementToFile(options) {
  const project = options?.project || {};
  const mixerInserts = Array.isArray(options?.mixerInserts)
    ? options.mixerInserts
    : [];
  const bpm = Math.max(40, Math.min(300, Number(options?.bpm || 140)));
  const format =
    String(options?.format || "wav").toLowerCase() === "mp3" ? "mp3" : "wav";
  const mp3BitrateKbps = clamp(
    Math.round(Number(options?.mp3BitrateKbps || 320)),
    96,
    320,
  );
  const wavEncoding = getSafeWavEncoding(options?.wavBitDepth);
  const requestedName = String(options?.fileName || "render").trim();
  const safeBaseName =
    requestedName.replace(/[\\/:*?"<>|]+/g, "_").trim() || "render";

  const songLengthSteps = getSongLengthInSteps(project);
  const sixteenth = 60 / bpm / 4;
  const tailSeconds = 1.6;
  const durationSeconds = Math.max(
    0.5,
    songLengthSteps * sixteenth + tailSeconds,
  );
  const sampleRate = 44100;
  const totalFrames = Math.max(1, Math.ceil(durationSeconds * sampleRate));
  const audioCtx = new OfflineAudioContext(2, totalFrames, sampleRate);

  const inserts = buildInsertInputNodes(audioCtx, mixerInserts);
  const channels = Array.isArray(project?.channels) ? project.channels : [];
  const events = collectEvents(project);

  const uniqueSampleRefs = Array.from(
    new Set(
      channels
        .map(function (channel) {
          return String(channel?.sampleRef || "").trim();
        })
        .filter(Boolean),
    ),
  );

  const sampleBufferByRef = new Map();
  await Promise.all(
    uniqueSampleRefs.map(async function (sampleRef) {
      try {
        const safeSampleRef = toSafeSampleUrl(sampleRef);
        if (!safeSampleRef) {
          return;
        }

        const response = await fetch(safeSampleRef);
        if (!response.ok) {
          return;
        }
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(
          arrayBuffer.slice(0),
        );
        sampleBufferByRef.set(sampleRef, audioBuffer);
      } catch {
        return;
      }
    }),
  );

  const uniquePluginRefs = Array.from(
    new Set(
      channels
        .map(function (channel) {
          return String(channel?.pluginRef || "").trim();
        })
        .filter(Boolean),
    ),
  );

  const pluginInstrumentByRef = new Map();
  await Promise.all(
    uniquePluginRefs.map(async function (pluginRef) {
      const pluginMeta = getPluginInstrument(pluginRef);
      if (!pluginMeta?.soundfont) {
        return;
      }

      try {
        const instrument = await Soundfont.instrument(
          audioCtx,
          pluginMeta.soundfont,
          {
            destination: inserts.masterInput,
          },
        );
        pluginInstrumentByRef.set(pluginRef, instrument);
      } catch {
        return;
      }
    }),
  );

  const normalizeGainByBuffer = new WeakMap();

  const getNormalizeGain = function (sampleBuffer) {
    const cached = normalizeGainByBuffer.get(sampleBuffer);
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

    const normalizeGain =
      peak > 0.0001 ? Math.max(0.25, Math.min(4, 0.9 / peak)) : 1;
    normalizeGainByBuffer.set(sampleBuffer, normalizeGain);
    return normalizeGain;
  };

  const activeSampleVoicesByChannel = new Map();

  const stopActiveChannelSamples = function (channelId, atTime) {
    const voices = activeSampleVoicesByChannel.get(channelId);
    if (!voices || voices.size === 0) {
      return false;
    }

    voices.forEach(function (voice) {
      try {
        const releaseSec = Math.min(
          CUT_ITSELF_MAX_RETRIGGER_RELEASE_SEC,
          Math.max(CUT_ITSELF_RELEASE_SEC, Number(voice.cutReleaseSec || 0)),
        );
        const tau = Math.max(0.001, releaseSec * 0.25);
        const voiceStopAt = atTime + releaseSec;
        // Do not cancel existing automation here, otherwise we can introduce
        // discontinuities in OfflineAudioContext and audible clicks.
        voice.gain.gain.setTargetAtTime(0.0001, atTime, tau);
        voice.source.stop(voiceStopAt + CUT_ITSELF_STOP_PADDING_SEC);
      } catch {
        return;
      }
    });

    voices.clear();
    return true;
  };

  events.forEach(function (event) {
    const channel = event.channel;
    const settings = getSafeSampleSettings(channel.sampleSettings);
    const insertNode = inserts.insertMap.get(channel.mixerInsertId);
    const insertInput = insertNode?.inputGain || inserts.fallbackInsertInput;

    const noteStartTime = Math.max(
      0,
      Number(event.offsetSteps || 0) * sixteenth,
    );
    const noteLengthSteps = Math.max(0.0625, Number(event.lengthSteps || 1));

    const pluginRef = String(channel.pluginRef || "").trim();
    const plugin = pluginInstrumentByRef.get(pluginRef);
    const sampleRef = String(channel.sampleRef || "").trim();
    const sampleBuffer = sampleBufferByRef.get(sampleRef);
    const channelVolume = clamp(Number(channel.volume ?? 1), 0, 1);
    const velocityScale = clamp(
      Number(event.velocity || DEFAULT_NOTE_VELOCITY) / 127,
      1 / 127,
      1,
    );
    const channelBaseGain =
      BASE_CHANNEL_TRIGGER_GAIN * channelVolume * velocityScale;

    if (plugin) {
      const transposedPitch = clamp(
        Number(event.midiPitch || DEFAULT_SAMPLE_MIDI_PITCH) +
          Number(settings.pitchCents || 0) / 100,
        0,
        127,
      );
      const attackSec = Math.max(0, Number(settings.attackMs || 0) / 1000);
      const releaseSec = Math.max(0, Number(settings.releaseMs ?? 420) / 1000);
      const noteDuration = Math.max(
        0.1,
        noteLengthSteps * sixteenth * 0.95 + releaseSec,
      );
      const noteGain = Math.max(
        0,
        channelBaseGain * 2.2 * PLUGIN_INSTRUMENT_GAIN_BOOST,
      );

      try {
        plugin.play(transposedPitch, noteStartTime, {
          duration: noteDuration,
          gain: noteGain,
          attack: attackSec,
          release: releaseSec,
          pan: clamp(Number(channel.pan || 0), -1, 1),
          destination: insertInput,
        });
      } catch {
        return;
      }

      return;
    }

    if (!sampleBuffer) {
      return;
    }

    const source = audioCtx.createBufferSource();
    const gain = audioCtx.createGain();
    const envelopeGain = audioCtx.createGain();
    const panner = audioCtx.createStereoPanner();

    const safeMidiPitch = Number.isFinite(event.midiPitch)
      ? event.midiPitch
      : DEFAULT_SAMPLE_MIDI_PITCH;
    const pitchRate = Math.pow(2, Number(settings.pitchCents || 0) / 1200);
    const playbackRate = clamp(
      midiPitchToPlaybackRate(safeMidiPitch) * pitchRate,
      0.125,
      8,
    );

    const sampleReadDuration = Math.max(
      0.01,
      sampleBuffer.duration * (settings.lengthPct / 100),
    );
    const samplePlayableDuration = Math.max(
      0.01,
      sampleReadDuration / playbackRate,
    );
    const noteGateDuration = Math.max(0.01, noteLengthSteps * sixteenth);
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
          Math.min(samplePlayableDuration, noteGateDuration + envReleaseSec),
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
        ? (sourcePlayDuration * 0.98) / Math.max(0.0001, fadeTotal)
        : 1;
    const finalFadeIn = fadeInSec * fadeScale;
    const finalFadeOut = fadeOutSec * fadeScale;
    const finalGain = Math.max(
      0,
      channelBaseGain *
        (settings.normalize ? getNormalizeGain(sampleBuffer) : 1),
    );
    const sampleStopAt = noteStartTime + sourcePlayDuration;
    const fadeOutStart = Math.max(noteStartTime, sampleStopAt - finalFadeOut);

    const channelId = String(channel?.id || "").trim();
    let didRetriggerCut = false;
    if (settings.cutItself && channelId) {
      didRetriggerCut = stopActiveChannelSamples(channelId, noteStartTime);
    }

    source.buffer = sampleBuffer;
    source.playbackRate.setValueAtTime(playbackRate, noteStartTime);

    const retriggerFadeIn = didRetriggerCut
      ? Math.max(finalFadeIn, CUT_ITSELF_RETRIGGER_FADE_IN_SEC)
      : finalFadeIn;

    if (retriggerFadeIn > 0.001) {
      gain.gain.setValueAtTime(0.0001, noteStartTime);
      gain.gain.linearRampToValueAtTime(
        finalGain,
        noteStartTime + retriggerFadeIn,
      );
    } else {
      gain.gain.setValueAtTime(finalGain, noteStartTime);
    }

    gain.gain.setValueAtTime(finalGain, fadeOutStart);
    if (finalFadeOut > 0.001) {
      gain.gain.exponentialRampToValueAtTime(0.0001, sampleStopAt);
    } else {
      gain.gain.setValueAtTime(0.0001, sampleStopAt);
    }

    panner.pan.setValueAtTime(
      clamp(Number(channel.pan || 0), -1, 1),
      noteStartTime,
    );

    source.connect(gain);
    gain.connect(envelopeGain);

    if (shouldApplyEnvelope) {
      applyVolumeEnvelopeToGain(
        envelopeGain.gain,
        noteStartTime,
        envelopeGateDuration,
        settings,
      );
    } else {
      envelopeGain.gain.setValueAtTime(1, noteStartTime);
    }

    envelopeGain.connect(panner);
    panner.connect(insertInput);

    source.start(
      noteStartTime,
      0,
      Math.min(
        sampleReadDuration,
        sampleBuffer.duration,
        sourcePlayDuration * playbackRate,
      ),
    );
    source.stop(sampleStopAt + 0.005);

    if (channelId) {
      const channelVoices =
        activeSampleVoicesByChannel.get(channelId) || new Set();
      if (!activeSampleVoicesByChannel.has(channelId)) {
        activeSampleVoicesByChannel.set(channelId, channelVoices);
      }

      const voice = {
        source,
        gain,
        cutReleaseSec: Math.max(CUT_ITSELF_RELEASE_SEC, finalFadeOut),
      };

      channelVoices.add(voice);

      source.onended = function () {
        const voices = activeSampleVoicesByChannel.get(channelId);
        if (!voices) {
          return;
        }
        voices.delete(voice);
        if (voices.size === 0) {
          activeSampleVoicesByChannel.delete(channelId);
        }
      };
    }
  });

  const renderedBuffer = await audioCtx.startRendering();
  const blob =
    format === "mp3"
      ? await audioBufferToMp3Blob(renderedBuffer, mp3BitrateKbps)
      : audioBufferToWavBlob(renderedBuffer, wavEncoding.bitDepth);

  const fileName = safeBaseName + "." + format;
  triggerBrowserDownload(blob, fileName);

  return {
    blob,
    fileName,
    durationSeconds,
    mp3BitrateKbps,
    wavBitDepth: wavEncoding.bitDepth,
    wavBitDepthLabel: wavEncoding.label,
  };
}
