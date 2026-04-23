/**
 * @fileoverview usePreviewAudio — Pack browser preview playback and
 * the associated master-insert meter loop.
 *
 * Extracted from useAudioScheduler.js to decouple UI preview logic from
 * the transport scheduling engine.
 */

import { useRef, useCallback, useEffect } from "react";
import { clamp } from "../../store/utils";
import { setInsertMeter } from "../../store";

const PACK_PREVIEW_EVENT = "openstudio:packs-preview";
const BASE_CHANNEL_TRIGGER_GAIN = 0.75;

const MIXER_METER_RMS_GAIN = 4.2;
const MIXER_METER_PEAK_GAIN = 1.9;
const MIXER_METER_NOISE_GATE = 0.0016;
const MIXER_METER_RESPONSE_CURVE = 0.5;

export function usePreviewAudio({
  dispatch,
  audioCtxRef,
  mixerGraphRef,
  mixerSettingsRef,
  ensureContext,
  ensureMixerGraph,
  applyMixerSettingsToGraph,
  loadSampleBuffer,
  transportIsPlaying,
  mixerSettings,
}) {
  const packPreviewVoiceRef = useRef(null);
  const packPreviewMeterRafRef = useRef(null);

  const playPackBrowserPreview = useCallback(
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

      const previousVoice = packPreviewVoiceRef.current;
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
      const masterInsert = (mixerSettingsRef.current || []).find(function (
        insert,
      ) {
        return insert?.isMaster || insert?.id === "master";
      });
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
      packPreviewVoiceRef.current = voice;

      const stopPreviewMeterLoop = function () {
        if (packPreviewMeterRafRef.current) {
          cancelAnimationFrame(packPreviewMeterRafRef.current);
          packPreviewMeterRafRef.current = null;
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
        const level = Math.min(
          1,
          Math.pow(gated, MIXER_METER_RESPONSE_CURVE),
        );

        dispatch(
          setInsertMeter({
            insertId: "master",
            meter: level,
          }),
        );
      };

      if (!transportIsPlaying) {
        stopPreviewMeterLoop();

        const tickPreviewMeter = function () {
          if (packPreviewVoiceRef.current !== voice) {
            stopPreviewMeterLoop();
            return;
          }

          updateMasterPreviewMeter();
          packPreviewMeterRafRef.current =
            requestAnimationFrame(tickPreviewMeter);
        };

        packPreviewMeterRafRef.current =
          requestAnimationFrame(tickPreviewMeter);
      }

      source.onended = function () {
        stopPreviewMeterLoop();

        if (packPreviewVoiceRef.current === voice) {
          packPreviewVoiceRef.current = null;
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
      mixerGraphRef,
      mixerSettingsRef,
      transportIsPlaying,
    ],
  );

  useEffect(
    function () {
      const onPackPreviewRequest = function (event) {
        const samplePath = String(event?.detail?.samplePath || "").trim();
        if (!samplePath) {
          return;
        }

        void playPackBrowserPreview(samplePath);
      };

      window.addEventListener(PACK_PREVIEW_EVENT, onPackPreviewRequest);

      return function () {
        window.removeEventListener(
          PACK_PREVIEW_EVENT,
          onPackPreviewRequest,
        );

        const activeVoice = packPreviewVoiceRef.current;
        if (!activeVoice?.source || !audioCtxRef.current) {
          return;
        }

        if (packPreviewMeterRafRef.current) {
          cancelAnimationFrame(packPreviewMeterRafRef.current);
          packPreviewMeterRafRef.current = null;
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

        packPreviewVoiceRef.current = null;
      };
    },
    [playPackBrowserPreview, audioCtxRef],
  );

  useEffect(
    function () {
      if (!audioCtxRef.current) {
        return;
      }

      const voice = packPreviewVoiceRef.current;
      if (!voice?.masterPreviewGain) {
        return;
      }

      const masterInsert = (mixerSettingsRef.current || []).find(function (
        insert,
      ) {
        return insert?.isMaster || insert?.id === "master";
      });
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
    [mixerSettings, audioCtxRef, mixerSettingsRef],
  );

  return {
    playPackBrowserPreview,
  };
}
