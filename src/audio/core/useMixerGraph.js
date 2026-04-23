import { useCallback, useRef } from "react";
import { createMixerInsertNodes } from "./createMixerInsertNodes";
import { applyInsertSettings } from "./applyInsertSettings";

/**
 * Safely disconnects an AudioNode, swallowing errors that occur when the
 * node is already disconnected or the context is closed.
 */
export function safeDisconnect(node) {
  if (!node) {
    return;
  }
  try {
    node.disconnect();
  } catch {
    // Node may already be disconnected.
  }
}

/**
 * Builds a deterministic signature for the current mixer-settings array so
 * that we can skip expensive graph rebuilds when nothing has changed.
 */
function toMixerGraphSignature(settings) {
  return settings
    .map(function (insert) {
      const routes = Array.isArray(insert.routesTo)
        ? insert.routesTo.join(",")
        : "";
      return insert.id + ":" + routes + ":" + (insert.isMaster ? "m" : "i");
    })
    .join("|");
}

/**
 * Deep-equality check for mixer settings used by useSelector so that the
 * scheduler only re-renders when a fader, pan, route or FX slot actually
 * changes.
 */
export function areMixerSettingsEqual(prev, next) {
  if (prev === next) {
    return true;
  }
  if (!prev || !next || prev.length !== next.length) {
    return false;
  }

  for (let i = 0; i < prev.length; i += 1) {
    const a = prev[i];
    const b = next[i];
    if (!a || !b) {
      return false;
    }

    if (
      a.id !== b.id ||
      a.isMaster !== b.isMaster ||
      a.active !== b.active ||
      a.pan !== b.pan ||
      a.stereoSeparation !== b.stereoSeparation ||
      a.fader !== b.fader
    ) {
      return false;
    }

    const aSlots = a.fxSlots || [];
    const bSlots = b.fxSlots || [];
    if (aSlots.length !== bSlots.length) {
      return false;
    }

    for (let slotIndex = 0; slotIndex < aSlots.length; slotIndex += 1) {
      const aSlot = aSlots[slotIndex];
      const bSlot = bSlots[slotIndex];
      if (!aSlot || !bSlot) {
        return false;
      }

      if (
        aSlot.id !== bSlot.id ||
        aSlot.enabled !== bSlot.enabled ||
        aSlot.effectType !== bSlot.effectType
      ) {
        return false;
      }

      const aParams = aSlot.params || {};
      const bParams = bSlot.params || {};
      if (aSlot.effectType === "graphic-eq") {
        const aPoints = aParams.points || [];
        const bPoints = bParams.points || [];
        if (aPoints.length !== bPoints.length) {
          return false;
        }

        for (
          let pointIndex = 0;
          pointIndex < aPoints.length;
          pointIndex += 1
        ) {
          const aPoint = aPoints[pointIndex] || {};
          const bPoint = bPoints[pointIndex] || {};
          if (
            aPoint.frequencyHz !== bPoint.frequencyHz ||
            aPoint.gainDb !== bPoint.gainDb ||
            aPoint.q !== bPoint.q ||
            aPoint.bandType !== bPoint.bandType
          ) {
            return false;
          }
        }
      }

      if (aSlot.effectType === "reverb") {
        if (
          aParams.decayTime !== bParams.decayTime ||
          aParams.preDelayMs !== bParams.preDelayMs ||
          aParams.size !== bParams.size ||
          aParams.damping !== bParams.damping ||
          aParams.hiCutHz !== bParams.hiCutHz ||
          aParams.loCutHz !== bParams.loCutHz ||
          aParams.earlyReflections !== bParams.earlyReflections ||
          aParams.diffusion !== bParams.diffusion ||
          aParams.modulationDepth !== bParams.modulationDepth ||
          aParams.modulationRateHz !== bParams.modulationRateHz ||
          aParams.width !== bParams.width ||
          aParams.dryWet !== bParams.dryWet ||
          aParams.freeze !== bParams.freeze
        ) {
          return false;
        }
      }

      if (aSlot.effectType === "maximizer") {
        if (
          aParams.mode !== bParams.mode ||
          aParams.truePeakEnabled !== bParams.truePeakEnabled ||
          aParams.thresholdDb !== bParams.thresholdDb ||
          aParams.ceilingDb !== bParams.ceilingDb ||
          aParams.character !== bParams.character
        ) {
          return false;
        }
      }
    }
  }

  return true;
}

/**
 * Manages the real-time mixer insert graph: creation, teardown, parameter
 * updates, and per-channel input-node lookup.  The graph is cached by a
 * content signature so it is only rebuilt when mixer settings structurally
 * change.
 *
 * @param {() => AudioContext} ensureContext
 * @returns {object}
 */
export function useMixerGraph(ensureContext) {
  const mixerGraphRef = useRef(null);
  const mixerSettingsRef = useRef([]);

  const ensureMixerGraph = useCallback(
    function () {
      const audioCtx = ensureContext();
      const settings = mixerSettingsRef.current || [];
      const signature = toMixerGraphSignature(settings);

      if (
        mixerGraphRef.current &&
        mixerGraphRef.current.signature === signature
      ) {
        return mixerGraphRef.current;
      }

      // Tear down the old graph so we don't leak nodes.
      if (mixerGraphRef.current) {
        mixerGraphRef.current.inserts.forEach(function (node) {
          safeDisconnect(node.inputGain);
          safeDisconnect(node.splitter);
          safeDisconnect(node.leftToLeft);
          safeDisconnect(node.rightToLeft);
          safeDisconnect(node.leftToRight);
          safeDisconnect(node.rightToRight);
          safeDisconnect(node.merger);
          safeDisconnect(node.panner);
          safeDisconnect(node.fxDryGain);
          safeDisconnect(node.fxWetGain);
          safeDisconnect(node.eqInput);
          safeDisconnect(node.eqLowCut);
          if (Array.isArray(node.eqBands)) {
            node.eqBands.forEach(function (band) {
              safeDisconnect(band);
            });
          }
          safeDisconnect(node.reverbInput);
          safeDisconnect(node.reverbPreDelay);
          safeDisconnect(node.reverbLoCut);
          safeDisconnect(node.reverbHiCut);
          safeDisconnect(node.reverbEarlyGain);
          safeDisconnect(node.reverbLateInput);
          safeDisconnect(node.reverbLateLeftDelay);
          safeDisconnect(node.reverbLateRightDelay);
          safeDisconnect(node.reverbLeftFeedback);
          safeDisconnect(node.reverbRightFeedback);
          safeDisconnect(node.reverbLeftDamping);
          safeDisconnect(node.reverbRightDamping);
          safeDisconnect(node.reverbWidthSplitter);
          safeDisconnect(node.reverbLeftToLeft);
          safeDisconnect(node.reverbRightToLeft);
          safeDisconnect(node.reverbLeftToRight);
          safeDisconnect(node.reverbRightToRight);
          safeDisconnect(node.reverbWidthMerger);
          if (Array.isArray(node.reverbEarlyTaps)) {
            node.reverbEarlyTaps.forEach(function (tap) {
              safeDisconnect(tap.delay);
              safeDisconnect(tap.gain);
            });
          }
          if (Array.isArray(node.reverbModulators)) {
            node.reverbModulators.forEach(function (mod) {
              safeDisconnect(mod.lfo);
              safeDisconnect(mod.depth);
            });
          }
          safeDisconnect(node.reverbWetGain);
          safeDisconnect(node.maximizerInput);
          safeDisconnect(node.maximizerPreGain);
          safeDisconnect(node.maximizerPreAnalyser);
          safeDisconnect(node.maximizerCompressor);
          safeDisconnect(node.maximizerSoftClip);
          safeDisconnect(node.maximizerPostAnalyser);
          safeDisconnect(node.maximizerPreSplit);
          safeDisconnect(node.maximizerPostSplit);
          safeDisconnect(node.maximizerOutSplit);
          safeDisconnect(node.maximizerPreLeftAnalyser);
          safeDisconnect(node.maximizerPreRightAnalyser);
          safeDisconnect(node.maximizerPostLeftAnalyser);
          safeDisconnect(node.maximizerPostRightAnalyser);
          safeDisconnect(node.maximizerOutLeftAnalyser);
          safeDisconnect(node.maximizerOutRightAnalyser);
          safeDisconnect(node.maximizerCeilingGain);
          safeDisconnect(node.maximizerAnalyser);
          safeDisconnect(node.outputGain);
          safeDisconnect(node.analyser);
        });
      }

      const { insertMap: inserts, getOutputNode } = createMixerInsertNodes(
        audioCtx,
        settings,
        { includeAnalysers: true },
      );

      // Wire inter-insert routes (master / aux sends).
      settings.forEach(function (insert) {
        const node = inserts.get(insert.id);
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
          const target = inserts.get(targetId);
          if (!target) {
            return;
          }
          getOutputNode(node).connect(target.inputGain);
          hasConnectedRoute = true;
        });

        if (insert.isMaster || !hasConnectedRoute) {
          getOutputNode(node).connect(audioCtx.destination);
        }
      });

      mixerGraphRef.current = {
        signature,
        inserts,
      };

      return mixerGraphRef.current;
    },
    [ensureContext],
  );

  const applyMixerSettingsToGraph = useCallback(
    function () {
      const graph = mixerGraphRef.current;
      const audioCtx = ensureContext();
      if (!graph || !audioCtx) {
        return;
      }

      const now = audioCtx.currentTime;
      mixerSettingsRef.current.forEach(function (insert) {
        const node = graph.inserts.get(insert.id);
        if (!node) {
          return;
        }
        applyInsertSettings(node, insert, now, { useSmoothing: true });
      });
    },
    [ensureContext],
  );

  const getInsertInputNodeForChannel = useCallback(
    function (channel) {
      const graph = mixerGraphRef.current;
      if (!graph) {
        return ensureContext().destination;
      }

      const byChannel = graph.inserts.get(channel.mixerInsertId);
      if (byChannel) {
        return byChannel.inputGain;
      }

      const firstInsert = mixerSettingsRef.current.find(function (insert) {
        return !insert.isMaster;
      });
      const fallbackInsert = graph.inserts.get(firstInsert?.id || "master");
      return fallbackInsert
        ? fallbackInsert.inputGain
        : ensureContext().destination;
    },
    [ensureContext],
  );

  return {
    mixerGraphRef,
    mixerSettingsRef,
    ensureMixerGraph,
    applyMixerSettingsToGraph,
    getInsertInputNodeForChannel,
    areMixerSettingsEqual,
  };
}
