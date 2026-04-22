import { useCallback, useEffect, useRef } from "react";
import { getPluginInstrument } from "../../data/pluginInstruments";
import {
  clamp,
  midiPitchToPlaybackRate,
} from "./pianoRollUtils";
import {
  DEFAULT_SAMPLE_MIDI_PITCH,
  PITCH_MAX,
  PITCH_MIN,
} from "./pianoRollConstants";
import { usePianoRollPreviewLoaders } from "./usePianoRollPreviewLoaders";

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

          const transposedPitch = clamp(
            normalizedPitch + Number(settings.pitchCents || 0) / 100,
            0,
            127,
          );
          const attackSec = Math.max(
            0,
            Math.min(0.4, Number(settings.attackMs || 0) / 1000),
          );
          const releaseSec = Math.max(
            0.01,
            Math.min(1, Number(settings.releaseMs ?? 420) / 1000),
          );

          const node = instrument.play(transposedPitch, context.currentTime, {
            duration: 120,
            gain: Math.max(0.04, Number(activeChannel.volume ?? 0.7) * 0.24),
            pan: clamp(Number(activeChannel.pan || 0), -1, 1),
            attack: attackSec,
            release: releaseSec,
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

        const source = context.createBufferSource();
        const gain = context.createGain();
        const panner = context.createStereoPanner();

        const playbackRate = clamp(
          midiPitchToPlaybackRate(normalizedPitch) *
            Math.pow(2, Number(settings.pitchCents || 0) / 1200),
          0.125,
          8,
        );
        const readDuration = Math.max(
          0.01,
          sampleBuffer.duration *
            (Math.max(5, Math.min(100, Number(settings.lengthPct ?? 100))) /
              100),
        );
        const normalizeGain = settings.normalize
          ? getNormalizeGainForBuffer(sampleBuffer)
          : 1;
        const targetGain = Math.max(
          0.03,
          Math.min(
            1.4,
            Number(activeChannel.volume ?? 0.7) * 0.58 * normalizeGain,
          ),
        );
        const attackSec = Math.max(
          0,
          Math.min(0.4, Number(settings.attackMs ?? 8) / 1000),
        );
        // Keep preview release short to avoid overlap "echo" on quick clicks.
        const releaseSec = Math.max(
          0.01,
          Math.min(0.08, Number(settings.releaseMs ?? 420) / 1000),
        );

        source.buffer = sampleBuffer;
        source.playbackRate.setValueAtTime(playbackRate, context.currentTime);
        // Piano Roll preview should be one-shot while pressed, not looped.
        source.loop = false;

        if (attackSec > 0.001) {
          gain.gain.setValueAtTime(0.0001, context.currentTime);
          gain.gain.linearRampToValueAtTime(
            targetGain,
            context.currentTime + attackSec,
          );
        } else {
          gain.gain.setValueAtTime(targetGain, context.currentTime);
        }

        panner.pan.setValueAtTime(
          clamp(Number(activeChannel.pan || 0), -1, 1),
          context.currentTime,
        );

        source.connect(gain);
        gain.connect(panner);
        panner.connect(context.destination);

        source.start(
          context.currentTime,
          0,
          Math.min(readDuration, sampleBuffer.duration),
        );

        previewVoiceRef.current = {
          type: "sample",
          source,
          gain,
          releaseSec,
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
