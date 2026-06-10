const MIN_AUDIO_GAIN = 0.0001;

/**
 * Computes fade durations from Sample Settings percentages for any sample-like
 * playback window. The same shaping is used for pattern voices and playlist
 * audio clips so UI In/Out controls sound consistent everywhere.
 *
 * @param {number} sourcePlayDuration
 * @param {object} settings
 * @returns {{fadeInSec:number,shapedFadeOutPct:number,fadeOutSec:number,fadeTotal:number,fadeScale:number,finalFadeIn:number,finalFadeOut:number}}
 */
export function computeSampleFadeParams(sourcePlayDuration, settings) {
  const safeDuration = Math.max(0.0001, Number(sourcePlayDuration || 0));
  const fadeInPct = Math.max(0, Math.min(95, Number(settings?.fadeInPct || 0)));
  const fadeOutPct = Math.max(0, Math.min(95, Number(settings?.fadeOutPct || 0)));
  const fadeInSec = safeDuration * (fadeInPct / 100);
  const shapedFadeOutPct = Math.pow(fadeOutPct / 100, 0.7) * 100;
  const fadeOutSec = safeDuration * (shapedFadeOutPct / 100);
  const fadeTotal = fadeInSec + fadeOutSec;
  const fadeScale =
    fadeTotal > safeDuration * 0.98
      ? (safeDuration * 0.98) / Math.max(0.0001, fadeTotal)
      : 1;

  return {
    fadeInSec,
    shapedFadeOutPct,
    fadeOutSec,
    fadeTotal,
    fadeScale,
    finalFadeIn: fadeInSec * fadeScale,
    finalFadeOut: fadeOutSec * fadeScale,
  };
}

/**
 * Applies sample gain automation for fade-in and fade-out. This intentionally
 * mirrors the old sample-note node behavior while making it reusable by
 * playlist audio clips and offline render.
 *
 * @param {AudioParam} gainParam
 * @param {number} startTime
 * @param {number} sourcePlayDuration
 * @param {number} finalGain
 * @param {object} fadeParams
 * @param {object} [options]
 * @param {number} [options.retriggerFadeInSec]
 */
export function applySampleGainAutomation(
  gainParam,
  startTime,
  sourcePlayDuration,
  finalGain,
  fadeParams,
  options = {},
) {
  const safeDuration = Math.max(0.0001, Number(sourcePlayDuration || 0));
  const stopAt = startTime + safeDuration;
  const finalFadeIn = Math.max(0, Number(fadeParams?.finalFadeIn || 0));
  const finalFadeOut = Math.max(0, Number(fadeParams?.finalFadeOut || 0));
  const fadeOutStart = Math.max(startTime, stopAt - finalFadeOut);
  const fadeIn =
    Number(options.retriggerFadeInSec || 0) > 0.001
      ? Math.max(finalFadeIn, Number(options.retriggerFadeInSec || 0))
      : finalFadeIn;

  if (fadeIn > 0.001) {
    gainParam.setValueAtTime(MIN_AUDIO_GAIN, startTime);
    gainParam.linearRampToValueAtTime(finalGain, startTime + fadeIn);
  } else {
    gainParam.setValueAtTime(finalGain, startTime);
  }

  gainParam.setValueAtTime(finalGain, fadeOutStart);
  if (finalFadeOut > 0.001) {
    gainParam.exponentialRampToValueAtTime(MIN_AUDIO_GAIN, stopAt);
  } else {
    gainParam.setValueAtTime(MIN_AUDIO_GAIN, stopAt);
  }
}
