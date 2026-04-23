import { useCallback, useEffect, useRef } from "react";
import { getPluginInstrument } from "../../data/pluginInstruments";
import { clamp } from "./pianoRollUtils";
import {
  DEFAULT_SAMPLE_MIDI_PITCH,
  PITCH_MAX,
  PITCH_MIN,
} from "./pianoRollConstants";
import { usePianoRollPreviewLoaders } from "./usePianoRollPreviewLoaders";
import {
  createSamplePreviewVoice,
  resolvePluginPreviewParams,
  resolveSamplePreviewParams,
} from "./pianoRollPreviewVoiceUtils";

// One place for all Piano Roll preview audio concerns:
// - creating/resuming AudioContext
// - sample/plugin caching
// - start/stop envelope behavior
// - release listeners for mouse-up based one-shot playback
export const usePianoRollPreviewAudio = function ({ activeChannel }) {
  const {
    previewAudioContextRef,
    ensurePreviewContext,
    getPreviewSampleBuffer,
    getPreviewPluginInstrument,
    getNormalizeGainForBuffer,
  } = usePianoRollPreviewLoaders();
  const previewVoiceRef = useRef(null);
  const previewPitchRef = useRef(null);
  const previewChannelKeyRef = useRef("");
  const previewTokenRef = useRef(0);
  const previewStopListenersRef = useRef(null);

  const clearPreviewStopListeners = useCallback(function () {
    const listeners = previewStopListenersRef.current;
    if (!listeners) {
      return;
    }

    window.removeEventListener("mouseup", listeners.onMouseUp);
    window.removeEventListener("blur", listeners.onBlur);
    previewStopListenersRef.current = null;
  }, []);

  // Stop current preview voice safely with a short release ramp.
  const stopPreviewNote = useCallback(
    function () {
      previewTokenRef.current += 1;
      clearPreviewStopListeners();

      const voice = previewVoiceRef.current;
      previewVoiceRef.current = null;
      previewPitchRef.current = null;
      previewChannelKeyRef.current = "";

      if (!voice) {
        return;
      }

      if (voice.type === "plugin") {
        try {
          voice.node.stop();
        } catch {
          return;
        }
        return;
      }

      const context = previewAudioContextRef.current;
      if (!context) {
        return;
      }

      const now = context.currentTime;
      const source = voice.source;
      if (!source || !voice.gain) {
        return;
      }

      const releaseSec = Math.max(0.005, Number(voice.releaseSec || 0.05));

      try {
        const currentGain = Math.max(
          0.0001,
          Number(voice.gain.gain.value || 0),
        );
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setValueAtTime(currentGain, now);
        voice.gain.gain.linearRampToValueAtTime(0.0001, now + releaseSec);
        voice.source.stop(now + releaseSec + 0.01);
      } catch {
        return;
      }
    },
    [clearPreviewStopListeners, previewAudioContextRef],
  );

  // Arm one-shot release handling so clicking note behaves like "hold to preview".
  const armPreviewStopOnRelease = useCallback(
    function () {
      clearPreviewStopListeners();

      const onStop = function () {
        stopPreviewNote();
      };

      const listeners = {
        onMouseUp: onStop,
        onBlur: onStop,
      };

      previewStopListenersRef.current = listeners;
      window.addEventListener("mouseup", listeners.onMouseUp);
      window.addEventListener("blur", listeners.onBlur);
    },
    [clearPreviewStopListeners, stopPreviewNote],
  );

  // Start note preview for either plugin instrument or audio sample channel.
  const startPreviewNote = useCallback(
    async function (midiPitch) {
      if (!activeChannel) {
        return;
      }

      const sampleRef = String(activeChannel.sampleRef || "").trim();
      const pluginRef = String(activeChannel.pluginRef || "").trim();
      const plugin = getPluginInstrument(pluginRef);
      const hasPluginInstrument = Boolean(plugin && plugin.soundfont);

      if (!sampleRef && !hasPluginInstrument) {
        return;
      }

      const normalizedPitch = clamp(
        Math.round(Number(midiPitch || DEFAULT_SAMPLE_MIDI_PITCH)),
        PITCH_MIN,
        PITCH_MAX,
      );
      const channelPreviewKey =
        activeChannel.id + "|" + sampleRef + "|" + pluginRef;

      if (
        previewVoiceRef.current &&
        previewPitchRef.current === normalizedPitch &&
        previewChannelKeyRef.current === channelPreviewKey
      ) {
        armPreviewStopOnRelease();
        return;
      }

      stopPreviewNote();

      const token = previewTokenRef.current + 1;
      previewTokenRef.current = token;

      try {
        const context = ensurePreviewContext();
        if (context.state === "suspended") {
          await context.resume();
        }

        if (previewTokenRef.current !== token) {
          return;
        }

        const settings = activeChannel.sampleSettings || {};

        if (hasPluginInstrument) {
          const instrument = await getPreviewPluginInstrument(pluginRef);
          if (!instrument || previewTokenRef.current !== token) {
            return;
          }

          const pluginPreview = resolvePluginPreviewParams({
            normalizedPitch,
            settings,
            activeChannel,
          });

          const node = instrument.play(pluginPreview.transposedPitch, context.currentTime, {
            duration: 120,
            gain: pluginPreview.gain,
            pan: pluginPreview.pan,
            attack: pluginPreview.attackSec,
            release: pluginPreview.releaseSec,
            destination: context.destination,
          });

          if (!node || typeof node.stop !== "function") {
            return;
          }

          previewVoiceRef.current = {
            type: "plugin",
            node,
          };
          previewPitchRef.current = normalizedPitch;
          previewChannelKeyRef.current = channelPreviewKey;
          armPreviewStopOnRelease();
          return;
        }

        const sampleBuffer = await getPreviewSampleBuffer(sampleRef);
        if (!sampleBuffer || previewTokenRef.current !== token) {
          return;
        }

        const samplePreview = resolveSamplePreviewParams({
          normalizedPitch,
          settings,
          activeChannel,
          sampleBuffer,
          getNormalizeGainForBuffer,
        });
        const { source, gain } = createSamplePreviewVoice({
          context,
          sampleBuffer,
          playbackRate: samplePreview.playbackRate,
          readDuration: samplePreview.readDuration,
          targetGain: samplePreview.targetGain,
          attackSec: samplePreview.attackSec,
          pan: samplePreview.pan,
        });

        previewVoiceRef.current = {
          type: "sample",
          source,
          gain,
          releaseSec: samplePreview.releaseSec,
        };
        previewPitchRef.current = normalizedPitch;
        previewChannelKeyRef.current = channelPreviewKey;

        source.onended = function () {
          if (
            previewVoiceRef.current &&
            previewVoiceRef.current.source === source
          ) {
            previewVoiceRef.current = null;
            previewPitchRef.current = null;
            previewChannelKeyRef.current = "";
          }
        };

        armPreviewStopOnRelease();
      } catch {
        return;
      }
    },
    [
      activeChannel,
      armPreviewStopOnRelease,
      ensurePreviewContext,
      getNormalizeGainForBuffer,
      getPreviewPluginInstrument,
      getPreviewSampleBuffer,
      stopPreviewNote,
    ],
  );

  // Always stop preview and clean listeners when Piano Roll unmounts.
  useEffect(
    function () {
      return function () {
        stopPreviewNote();
      };
    },
    [stopPreviewNote],
  );

  return {
    startPreviewNote,
    stopPreviewNote,
  };
};
