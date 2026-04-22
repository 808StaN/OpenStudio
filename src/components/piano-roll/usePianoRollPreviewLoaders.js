import Soundfont from "soundfont-player";
import { useCallback, useRef } from "react";
import { getPluginInstrument } from "../../data/pluginInstruments";
import { toSafeSampleUrl } from "../../utils/sampleUrl";
import { clamp } from "./pianoRollUtils";

// Provides memoized loader helpers for Piano Roll preview audio.
// It centralizes AudioContext creation plus buffer/instrument caching.
export const usePianoRollPreviewLoaders = function () {
  const previewAudioContextRef = useRef(null);
  const previewSampleBufferCacheRef = useRef(new Map());
  const previewSamplePendingRef = useRef(new Map());
  const previewSampleNormalizeGainRef = useRef(new WeakMap());
  const previewPluginInstrumentsRef = useRef(new Map());
  const previewPluginPendingRef = useRef(new Map());

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

  return {
    previewAudioContextRef,
    ensurePreviewContext,
    getPreviewSampleBuffer,
    getPreviewPluginInstrument,
    getNormalizeGainForBuffer,
  };
};
