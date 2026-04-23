import { useCallback, useRef } from "react";
import Soundfont from "soundfont-player";
import { getPluginInstrument } from "../../data/pluginInstruments";

/**
 * Builds a stable cache key for a plugin instrument tied to a channel.
 * Different channels can load the same soundfont but are kept separate
 * so that per-channel insert routing never collides.
 */
export function getPluginInstrumentCacheKey(pluginRef, channelId) {
  const safePluginRef = String(pluginRef || "").trim();
  const safeChannelId = String(channelId || "").trim();
  return safePluginRef + "::" + safeChannelId;
}

/**
 * Re-routes an already-loaded soundfont instrument to a new destination.
 * Soundfont-player instruments expose either the instrument node itself
 * or an `output` property as the audio node; we try both and disconnect
 * the old route first to avoid double connections.
 */
export function routeInstrumentOutputToNode(instrument, destinationNode) {
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

/**
 * Manages loading, caching and per-channel routing of Soundfont plugin
 * instruments.  A single instrument can be loaded once per channel and
 * reused for every subsequent note, which avoids repeated network fetches.
 *
 * @param {() => AudioContext} ensureContext
 */
export function usePluginInstruments(ensureContext) {
  const pluginInstrumentRef = useRef(new Map());
  const pluginInstrumentLoadRef = useRef(new Map());
  const pluginInstrumentFailedRef = useRef(new Set());

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

  return {
    pluginInstrumentRef,
    pluginInstrumentLoadRef,
    pluginInstrumentFailedRef,
    loadPluginInstrument,
  };
}
