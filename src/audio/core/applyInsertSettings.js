import { getActiveFxState } from "./getActiveFxState";
import {
  buildSoftClipCurve,
  getDefaultEqBandType,
  GRAPHIC_EQ_DEFAULT_POINT_FREQUENCIES,
  sanitizeEqBandType,
  sanitizeMaximizerMode,
} from "../domain/fxParams";
import { clamp } from "../../store/utils";

/**
 * Applies all mixer-insert parameters (pan, stereo width, EQ, reverb,
 * maximizer) to a previously created insert node graph.
 *
 * This single implementation is shared between the real-time scheduler and the
 * offline exporter.  The only behavioural difference is how parameter changes
 * are scheduled: the offline path uses immediate `setValueAtTime` calls at
 * time 0, whereas the real-time path optionally smooths gain changes with short
 * linear ramps to avoid clicks when the user moves a fader or toggles an FX.
 *
 * @param {object} node – insert node graph produced by createMixerInsertNodes.
 * @param {object} insert – mixer insert descriptor from project state.
 * @param {number} atTime – audio-context time at which values should be set.
 * @param {object} [options]
 * @param {boolean} [options.useSmoothing=false] – when true, gain-parameter
 *   changes are ramped over `paramRampSec` instead of stepped.
 * @param {number} [options.paramRampSec=0.018] – duration of the smoothing
 *   ramp for generic gain parameters.
 * @param {number} [options.outputGainRampSec=0.01] – duration of the smoothing
 *   ramp specifically for the output fader (shorter, feels more responsive).
 */
export function applyInsertSettings(
  node,
  insert,
  atTime,
  options = {},
) {
  const {
    useSmoothing = false,
    paramRampSec = 0.018,
    outputGainRampSec = 0.01,
  } = options;

  /**
   * Schedules a value on an AudioParam.  When smoothing is requested we
   * cancel existing automation, snapshot the current value, and ramp to the
   * target.  This avoids discontinuities in the real-time path while keeping
   * the offline path deterministic and free of unnecessary ramps.
   */
  const smoothTo = useSmoothing
    ? function smoothTo(param, targetValue, time) {
        param.cancelScheduledValues(time);
        param.setValueAtTime(param.value, time);
        param.linearRampToValueAtTime(targetValue, time + paramRampSec);
      }
    : function setImmediately(param, targetValue, time) {
        param.setValueAtTime(targetValue, time);
      };

  const targetFader = insert.active
    ? Math.max(0, Math.min(1.25, Number(insert.fader ?? 1)))
    : 0;
  const targetPan = Math.max(-1, Math.min(1, Number(insert.pan || 0)));
  const targetSeparation = Math.max(
    -1,
    Math.min(1, Number(insert.stereoSeparation || 0)),
  );

  const activeFx = getActiveFxState(insert);
  const eqEnabled = activeFx.eqEnabled;
  const reverbEnabled = activeFx.reverbEnabled;
  const maximizerEnabled = activeFx.maximizerEnabled;
  const eqParams = activeFx.eqParams;
  const reverbParams = activeFx.reverbParams;
  const maximizerParams = activeFx.maximizerParams;
  const hasInsertFx = eqEnabled || maximizerEnabled;

  // ---- stereo width matrix ------------------------------------------------
  const width = 1 - targetSeparation;
  const directGain = 0.5 * (1 + width);
  const crossGain = 0.5 * (1 - width);

  node.leftToLeft.gain.setValueAtTime(directGain, atTime);
  node.rightToRight.gain.setValueAtTime(directGain, atTime);
  node.rightToLeft.gain.setValueAtTime(crossGain, atTime);
  node.leftToRight.gain.setValueAtTime(crossGain, atTime);
  node.panner.pan.setValueAtTime(targetPan, atTime);

  // ---- dry/wet routing ----------------------------------------------------
  const dryMix = hasInsertFx
    ? 0
    : reverbEnabled
      ? clamp(1 - reverbParams.dryWet, 0, 1)
      : 1;
  const wetMix = hasInsertFx || reverbEnabled ? 1 : 0;

  smoothTo(node.fxDryGain.gain, dryMix, atTime);
  smoothTo(node.fxWetGain.gain, wetMix, atTime);
  smoothTo(node.eqInput.gain, eqEnabled ? 1 : 0, atTime);
  node.eqLowCut.frequency.setValueAtTime(20, atTime);
  node.eqLowCut.Q.setValueAtTime(0.707, atTime);

  // ---- graphic EQ ---------------------------------------------------------
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
      bandNode.frequency.setValueAtTime(point.frequencyHz, atTime);
      bandNode.Q.setValueAtTime(point.q, atTime);
      smoothTo(bandNode.gain, eqEnabled ? point.gainDb : 0, atTime);
    });
  }

  // ---- reverb parameters --------------------------------------------------
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

  smoothTo(node.reverbInput.gain, reverbInputLevel, atTime);
  node.reverbPreDelay.delayTime.setValueAtTime(preDelaySec, atTime);
  node.reverbLoCut.frequency.setValueAtTime(loCutHz, atTime);
  node.reverbLoCut.Q.setValueAtTime(0.707, atTime);
  node.reverbHiCut.frequency.setValueAtTime(hiCutHz, atTime);
  node.reverbHiCut.Q.setValueAtTime(0.62, atTime);

  node.reverbLateLeftDelay.delayTime.setValueAtTime(leftBaseDelay, atTime);
  node.reverbLateRightDelay.delayTime.setValueAtTime(rightBaseDelay, atTime);
  smoothTo(node.reverbLeftFeedback.gain, feedbackBase, atTime);
  smoothTo(node.reverbRightFeedback.gain, feedbackBase * 0.985, atTime);
  node.reverbLeftDamping.frequency.setValueAtTime(dampFreq, atTime);
  node.reverbRightDamping.frequency.setValueAtTime(dampFreq * 0.96, atTime);
  node.reverbLeftDamping.Q.setValueAtTime(0.68, atTime);
  node.reverbRightDamping.Q.setValueAtTime(0.68, atTime);
  node.reverbEarlyGain.gain.setValueAtTime(earlyLevel, atTime);

  if (Array.isArray(node.reverbEarlyTaps)) {
    node.reverbEarlyTaps.forEach(function (tap, tapIndex) {
      const spread = reverbSize * 0.018 + reverbDiffusion * 0.011;
      const base = Number(tap.baseTime || 0.012);
      tap.delay.delayTime.setValueAtTime(base + spread, atTime);
      const tapBaseGain = [0.5, 0.36, 0.26, 0.2][tapIndex] || 0.2;
      tap.gain.gain.setValueAtTime(tapBaseGain * earlyLevel, atTime);
    });
  }

  node.reverbLeftToLeft.gain.setValueAtTime(directWidth, atTime);
  node.reverbRightToRight.gain.setValueAtTime(directWidth, atTime);
  node.reverbRightToLeft.gain.setValueAtTime(crossWidth, atTime);
  node.reverbLeftToRight.gain.setValueAtTime(crossWidth, atTime);

  smoothTo(
    node.reverbWetGain.gain,
    reverbEnabled
      ? hasInsertFx
        ? clamp(reverbParams.dryWet, 0, 1)
        : 1
      : 0,
    atTime,
  );

  if (Array.isArray(node.reverbModulators)) {
    node.reverbModulators.forEach(function (modNode, index) {
      modNode.lfo.frequency.setValueAtTime(
        modRate * (index === 0 ? 1 : 1.17),
        atTime,
      );
      modNode.depth.gain.setValueAtTime(
        (0.0004 + modDepth * 0.0032) * (index === 0 ? 1 : -1),
        atTime,
      );
    });
  }

  // ---- maximizer parameters -----------------------------------------------
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
    atTime,
  );
  smoothTo(
    node.maximizerPreGain.gain,
    maximizerEnabled ? Math.pow(10, preGainDb / 20) : 1,
    atTime,
  );
  node.maximizerCompressor.threshold.setValueAtTime(
    compressorThresholdDb,
    atTime,
  );
  node.maximizerCompressor.ratio.setValueAtTime(ratio, atTime);
  node.maximizerCompressor.knee.setValueAtTime(kneeDb, atTime);
  node.maximizerCompressor.attack.setValueAtTime(attackSec, atTime);
  node.maximizerCompressor.release.setValueAtTime(releaseSec, atTime);
  node.maximizerSoftClip.curve =
    maximizerEnabled && clipStrength > 0.001
      ? buildSoftClipCurve(clipStrength)
      : null;
  node.maximizerSoftClip.oversample = truePeakEnabled ? "4x" : "2x";
  smoothTo(
    node.maximizerCeilingGain.gain,
    maximizerEnabled ? ceilingGain : 1,
    atTime,
  );

  // ---- output fader -------------------------------------------------------
  // The output fader gets its own smoothing logic because in the real-time
  // path we want an extra-short ramp (10 ms) that snaps to the current
  // value before ramping, giving an immediate but click-free response.
  if (useSmoothing) {
    node.outputGain.gain.cancelScheduledValues(atTime);
    node.outputGain.gain.setValueAtTime(
      node.outputGain.gain.value,
      atTime,
    );
    node.outputGain.gain.linearRampToValueAtTime(
      targetFader,
      atTime + outputGainRampSec,
    );
  } else {
    node.outputGain.gain.setValueAtTime(targetFader, atTime);
  }
}
