import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useAudioContext } from "./core/useAudioContext";
import { useSampleBuffers } from "./core/useSampleBuffers";
import { useMixerGraph, areMixerSettingsEqual } from "./core/useMixerGraph";
import { useMixerMeters } from "./core/useMixerMeters";
import { useAudioVoices } from "./core/useAudioVoices";
import { usePreviewAudio } from "./core/usePreviewAudio";
import {
  usePluginInstruments,
  getPluginInstrumentCacheKey,
} from "./core/usePluginInstruments";
import { useTransportScheduler } from "./core/useTransportScheduler";
import {
  FX_EFFECT_GRAPHIC_EQ,
  FX_EFFECT_MAXIMIZER,
  FX_EFFECT_REVERB,
  getSafeGraphicEqParams,
  getSafeMaximizerParams,
  getSafeReverbParams,
} from "./domain/fxParams";
import { getPluginInstrument } from "../data/pluginInstruments";
import { toSafeSampleUrl } from "../utils/sampleUrl";

export function useAudioScheduler() {
  const dispatch = useDispatch();
  const transport = useSelector(function (state) {
    return state.daw.transport;
  });
  const channels = useSelector(function (state) {
    return state.daw.project.channels;
  });
  const activePatternId = useSelector(function (state) {
    return state.daw.project.activePatternId;
  });
  const activePattern = useSelector(function (state) {
    return state.daw.project.patterns.find(function (item) {
      return item.id === activePatternId;
    });
  });
  const patterns = useSelector(function (state) {
    return state.daw.project.patterns;
  });
  const playlistClips = useSelector(function (state) {
    return state.daw.project.playlistClips;
  });
  const mixerSettings = useSelector(function (state) {
    return state.daw.mixer.inserts.map(function (insert) {
      return {
        id: insert.id,
        isMaster: Boolean(insert.isMaster),
        active: Boolean(insert.active),
        pan: Number(insert.pan || 0),
        stereoSeparation: Number(insert.stereoSeparation || 0),
        fader: Number(insert.fader || 0),
        routesTo: Array.isArray(insert.routesTo) ? insert.routesTo.slice() : [],
        fxSlots: (Array.isArray(insert.fxSlots) ? insert.fxSlots : []).map(
          function (slot) {
            const effectType = String(slot.effectType || "none");
            return {
              id: slot.id,
              enabled: Boolean(slot.enabled),
              effectType,
              params:
                effectType === FX_EFFECT_GRAPHIC_EQ
                  ? getSafeGraphicEqParams(slot.params)
                  : effectType === FX_EFFECT_REVERB
                    ? getSafeReverbParams(slot.params)
                    : effectType === FX_EFFECT_MAXIMIZER
                      ? getSafeMaximizerParams(slot.params)
                      : null,
            };
          },
        ),
      };
    });
  }, areMixerSettingsEqual);
  const selectedInsertId = useSelector(function (state) {
    return state.daw.mixer.selectedInsertId;
  });
  const fxEditorTarget = useSelector(function (state) {
    return state.daw.ui.fxEditorTarget;
  });

  const { audioCtxRef, ensureContext } = useAudioContext();

  const {
    sampleBufferCacheRef,
    sampleLoadFailedRef,
    loadSampleBuffer,
  } = useSampleBuffers(ensureContext);

  const sampleNormalizeGainRef = useRef(new WeakMap());
  const stretchedSampleBufferCacheRef = useRef(new WeakMap());

  const {
    activeSampleVoicesRef,
    activeSynthVoicesRef,
    stopActiveChannelSamples,
    stopActiveChannelSynthVoices,
    stopAllActiveSamples,
  } = useAudioVoices();

  const {
    pluginInstrumentRef,
    pluginInstrumentFailedRef,
    loadPluginInstrument,
  } = usePluginInstruments(ensureContext);

  const channelsRef = useRef(channels);
  const activePatternRef = useRef(activePattern);
  const patternsRef = useRef(patterns);
  const playlistClipsRef = useRef(playlistClips);
  const transportModeRef = useRef(transport.mode);
  const songLoopEnabledRef = useRef(Boolean(transport.songLoopEnabled));

  const {
    mixerGraphRef,
    mixerSettingsRef,
    ensureMixerGraph,
    applyMixerSettingsToGraph,
    getInsertInputNodeForChannel,
  } = useMixerGraph(ensureContext);

  const spectrumTargetInsertIdRef = useRef(
    String(fxEditorTarget?.insertId || selectedInsertId || ""),
  );

  const {
    updateMixerMeters,
    resetMeterState,
    lastMeterLevelsRef,
    lastMeterWaveformRef,
    lastMaximizerReductionRef,
    lastMaximizerOutputDbRef,
    lastMaximizerStereoMeterRef,
  } = useMixerMeters(
    dispatch,
    mixerGraphRef,
    mixerSettingsRef,
    spectrumTargetInsertIdRef,
  );

  useEffect(
    function () {
      spectrumTargetInsertIdRef.current = String(
        fxEditorTarget?.insertId || selectedInsertId || "",
      );
    },
    [fxEditorTarget?.insertId, selectedInsertId],
  );

  usePreviewAudio({
    dispatch,
    audioCtxRef,
    mixerGraphRef,
    mixerSettingsRef,
    ensureContext,
    ensureMixerGraph,
    applyMixerSettingsToGraph,
    loadSampleBuffer,
    transportIsPlaying: transport.isPlaying,
    mixerSettings,
  });

  useEffect(
    function () {
      channelsRef.current = channels;
    },
    [channels],
  );

  useEffect(
    function () {
      activePatternRef.current = activePattern;
    },
    [activePattern],
  );

  useEffect(
    function () {
      patternsRef.current = patterns;
    },
    [patterns],
  );

  useEffect(
    function () {
      playlistClipsRef.current = playlistClips;
    },
    [playlistClips],
  );

  useEffect(
    function () {
      transportModeRef.current = transport.mode;
    },
    [transport.mode],
  );

  useEffect(
    function () {
      songLoopEnabledRef.current = Boolean(transport.songLoopEnabled);
    },
    [transport.songLoopEnabled],
  );

  useEffect(
    function () {
      mixerSettingsRef.current = mixerSettings;

      if (!audioCtxRef.current) {
        return;
      }

      ensureMixerGraph();
      applyMixerSettingsToGraph();
    },
    [mixerSettings, ensureMixerGraph, applyMixerSettingsToGraph, audioCtxRef, mixerSettingsRef],
  );

  useEffect(
    function () {
      const sampleRefs = Array.from(
        new Set(
          channels
            .map(function (channel) {
              return channel.sampleRef;
            })
            .filter(Boolean),
        ),
      );

      sampleRefs.forEach(function (sampleRef) {
        const safeSampleUrl = toSafeSampleUrl(sampleRef);
        if (!sampleBufferCacheRef.current.has(safeSampleUrl)) {
          void loadSampleBuffer(sampleRef);
        }
      });
    },
    [channels, loadSampleBuffer, sampleBufferCacheRef],
  );

  useEffect(
    function () {
      if (channels.length === 0) {
        return;
      }

      ensureMixerGraph();

      channels.forEach(function (channel) {
        const pluginRef = String(channel.pluginRef || "").trim();
        if (!pluginRef) {
          return;
        }

        if (!getPluginInstrument(pluginRef)) {
          return;
        }

        const key = getPluginInstrumentCacheKey(pluginRef, channel.id);

        if (pluginInstrumentFailedRef.current.has(key)) {
          return;
        }

        const outputNode = getInsertInputNodeForChannel(channel);

        void loadPluginInstrument(pluginRef, channel.id, outputNode);
      });
    },
    [
      channels,
      ensureMixerGraph,
      getInsertInputNodeForChannel,
      loadPluginInstrument,
      pluginInstrumentFailedRef,
    ],
  );

  useTransportScheduler({
    transport,
    dispatch,
    audioCtxRef,
    ensureContext,
    mixerGraphRef,
    mixerSettingsRef,
    ensureMixerGraph,
    applyMixerSettingsToGraph,
    getInsertInputNodeForChannel,
    sampleBufferCacheRef,
    sampleLoadFailedRef,
    loadSampleBuffer,
    stretchedSampleBufferCacheRef,
    sampleNormalizeGainRef,
    pluginInstrumentRef,
    pluginInstrumentFailedRef,
    loadPluginInstrument,
    activeSampleVoicesRef,
    activeSynthVoicesRef,
    stopActiveChannelSamples,
    stopActiveChannelSynthVoices,
    stopAllActiveSamples,
    updateMixerMeters,
    resetMeterState,
    lastMeterLevelsRef,
    lastMeterWaveformRef,
    lastMaximizerReductionRef,
    lastMaximizerOutputDbRef,
    lastMaximizerStereoMeterRef,
    channelsRef,
    activePatternRef,
    patternsRef,
    playlistClipsRef,
    transportModeRef,
    songLoopEnabledRef,
  });
}
