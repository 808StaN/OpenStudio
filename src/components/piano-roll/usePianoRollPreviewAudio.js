import Soundfont from "soundfont-player";
import { useCallback, useEffect, useRef } from "react";
import { getPluginInstrument } from "../../data/pluginInstruments";
import { toSafeSampleUrl } from "../../utils/sampleUrl";
import {
  clamp,
  midiPitchToPlaybackRate,
} from "./pianoRollUtils";
import {
  DEFAULT_SAMPLE_MIDI_PITCH,
  PITCH_MAX,
  PITCH_MIN,
} from "./pianoRollConstants";

// One place for all Piano Roll preview audio concerns:
// - creating/resuming AudioContext
// - sample/plugin caching
// - start/stop envelope behavior
// - release listeners for mouse-up based one-shot playback
export const usePianoRollPreviewAudio = function ({ activeChannel }) {
  const previewAudioContextRef = useRef(null);
  const previewSampleBufferCacheRef = useRef(new Map());
  const previewSamplePendingRef = useRef(new Map());
  const previewSampleNormalizeGainRef = useRef(new WeakMap());
  const previewPluginInstrumentsRef = useRef(new Map());
  const previewPluginPendingRef = useRef(new Map());
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
    [clearPreviewStopListeners],
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

  // Lazily create context only when preview is requested.
  const ensurePreviewContext = useCallback(function () {
    if (!previewAudioContextRef.current) {
      previewAudioContextRef.current = new AudioContext();
    }

    return previewAudioContextRef.current;
  }, []);

  // Decode and cache sample buffers by safe URL.
  const getPreviewSampleBuffer = useCallback(
    async function (sampleRef) {
      const safeSampleRef = toSafeSampleUrl(sampleRef);
      if (!safeSampleRef) {
        return null;
      }

      const cached = previewSampleBufferCacheRef.current.get(safeSampleRef);
      if (cached) {
        return cached;
      }

      const pending = previewSamplePendingRef.current.get(safeSampleRef);
      if (pending) {
        return pending;
      }

      const request = (async function () {
        const context = ensurePreviewContext();
        const response = await fetch(safeSampleRef);
        if (!response.ok) {
          throw new Error("Sample request failed");
        }

        const data = await response.arrayBuffer();
        const decoded = await context.decodeAudioData(data.slice(0));
        previewSampleBufferCacheRef.current.set(safeSampleRef, decoded);
        return decoded;
      })();

      previewSamplePendingRef.current.set(safeSampleRef, request);

      try {
        return await request;
      } finally {
        previewSamplePendingRef.current.delete(safeSampleRef);
      }
    },
    [ensurePreviewContext],
  );

  // Load and cache soundfont instruments to avoid repeated network + decode cost.
  const getPreviewPluginInstrument = useCallback(
    async function (pluginRef) {
      const plugin = getPluginInstrument(pluginRef);
      if (!plugin || !plugin.soundfont) {
        return null;
      }

      const key = plugin.pluginRef;
      const cached = previewPluginInstrumentsRef.current.get(key);
      if (cached) {
        return cached;
      }

      const pending = previewPluginPendingRef.current.get(key);
      if (pending) {
        return pending;
      }

      const request = Soundfont.instrument(
        ensurePreviewContext(),
        plugin.soundfont,
        {
          destination: ensurePreviewContext().destination,
        },
      )
        .then(function (instrument) {
          previewPluginInstrumentsRef.current.set(key, instrument);
          return instrument;
        })
        .catch(function () {
          return null;
        })
        .finally(function () {
          previewPluginPendingRef.current.delete(key);
        });

      previewPluginPendingRef.current.set(key, request);
      return request;
    },
    [ensurePreviewContext],
  );

  // Estimate peak and cache normalization gain per decoded buffer.
  const getNormalizeGainForBuffer = useCallback(function (buffer) {
    if (!buffer) {
      return 1;
    }

    const cached = previewSampleNormalizeGainRef.current.get(buffer);
    if (Number.isFinite(cached)) {
      return cached;
    }

    let peak = 0;
    const channelsCount = Math.max(1, Number(buffer.numberOfChannels || 1));

    for (let ch = 0; ch < channelsCount; ch += 1) {
      const channelData = buffer.getChannelData(ch);
      const step = Math.max(1, Math.floor(channelData.length / 64000));

      for (let i = 0; i < channelData.length; i += step) {
        peak = Math.max(peak, Math.abs(channelData[i]));
      }
    }

    const normalizeGain = peak > 0.0001 ? clamp(0.9 / peak, 0.25, 4) : 1;
    previewSampleNormalizeGainRef.current.set(buffer, normalizeGain);
    return normalizeGain;
  }, []);

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
