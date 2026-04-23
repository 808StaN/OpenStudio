/**
 * @fileoverview useAudioVoices — Lifecycle management for active sample,
 * plugin-instrument and synth (Soundfont) voices.
 *
 * Extracted from useAudioScheduler.js to decouple voice bookkeeping from
 * transport scheduling logic.
 */

import { useRef, useCallback } from "react";

const MIN_AUDIO_GAIN = 0.0001;
const CUT_ITSELF_RELEASE_SEC = 0.01;
const CUT_ITSELF_STOP_PADDING_SEC = 0.003;

/**
 * Smoothly ramps a gain AudioParam to near-silence and returns the safe
 * stop time so that connected sources can be stopped after the fade.
 */
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

export function useAudioVoices() {
  const activeSampleVoicesRef = useRef(new Map());
  const activeSynthVoicesRef = useRef(new Map());

  const stopActiveChannelSamples = useCallback(function (channelId, atTime) {
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
  }, []);

  const stopActiveChannelSynthVoices = useCallback(function (channelId, atTime) {
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
  }, []);

  const stopAllActiveSamples = useCallback(
    function (atTime) {
      Array.from(activeSampleVoicesRef.current.keys()).forEach(function (
        channelId,
      ) {
        stopActiveChannelSamples(channelId, atTime);
      });

      Array.from(activeSynthVoicesRef.current.keys()).forEach(function (
        channelId,
      ) {
        stopActiveChannelSynthVoices(channelId, atTime);
      });
    },
    [stopActiveChannelSamples, stopActiveChannelSynthVoices],
  );

  return {
    activeSampleVoicesRef,
    activeSynthVoicesRef,
    stopActiveChannelSamples,
    stopActiveChannelSynthVoices,
    stopAllActiveSamples,
  };
}
