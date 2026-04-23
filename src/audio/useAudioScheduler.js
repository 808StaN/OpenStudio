import { useCallback, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { clamp } from "../store/utils";
import { useAudioContext } from "./core/useAudioContext";
import { useSampleBuffers } from "./core/useSampleBuffers";
import { useMixerGraph, areMixerSettingsEqual } from "./core/useMixerGraph";
import { useMixerMeters } from "./core/useMixerMeters";
import { useAudioVoices } from "./core/useAudioVoices";
import {
  usePluginInstruments,
  getPluginInstrumentCacheKey,
  routeInstrumentOutputToNode,
} from "./core/usePluginInstruments";
import { computeSamplePlaybackParams } from "./core/computeSamplePlaybackParams";
import { createSamplePlaybackNodes } from "./core/createSamplePlaybackNodes";
import {
  FX_EFFECT_GRAPHIC_EQ,
  FX_EFFECT_MAXIMIZER,
  FX_EFFECT_REVERB,
  getSafeGraphicEqParams,
  getSafeMaximizerParams,
  getSafeReverbParams,
  GRAPHIC_EQ_DEFAULT_POINT_FREQUENCIES,
} from "./domain/fxParams";
import { DEFAULT_SAMPLE_MIDI_PITCH, midiPitchToPlaybackRate } from "./domain/pitch";
import { getSafeSampleSettings } from "./domain/sampleSettings";
import { getTimeStretchProfile } from "./domain/timeStretch";
import { getPluginInstrument } from "../data/pluginInstruments";
import { setInsertMeter, setPlayheadStep, setPlaying } from "../store";
import { toSafeSampleUrl } from "../utils/sampleUrl";
import { createWsolaStretchedBufferFromSample } from "./wsolaStretch";

const DEFAULT_NOTE_VELOCITY = 95;
const PLUGIN_INSTRUMENT_GAIN_BOOST = 1.5;
const BASE_CHANNEL_TRIGGER_GAIN = 0.75;
const PACK_PREVIEW_EVENT = "openstudio:packs-preview";
const SAMPLE_SETTINGS_PREVIEW_PLAY_EVENT =
  "openstudio:sample-settings-preview-play";
const SAMPLE_SETTINGS_PREVIEW_STOP_EVENT =
  "openstudio:sample-settings-preview-stop";



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

  const rafIdRef = useRef(null);
  const nextNoteTimeRef = useRef(0);
  const stepRef = useRef(0);
  const startedAtRef = useRef(0);
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

  const packPreviewVoiceRef = useRef(null);
  const packPreviewMeterRafRef = useRef(null);
  const sampleSettingsPreviewMeterRafRef = useRef(null);
  const sampleSettingsPreviewMeterInsertIdRef = useRef(null);
  const channelsRef = useRef(channels);
  const activePatternRef = useRef(activePattern);
  const patternsRef = useRef(patterns);
  const playlistClipsRef = useRef(playlistClips);
  const transportModeRef = useRef(transport.mode);
  const songLoopEnabledRef = useRef(Boolean(transport.songLoopEnabled));
  const scheduledAudioClipStartRef = useRef(new Map());
  const {
    mixerGraphRef,
    mixerSettingsRef,
    ensureMixerGraph,
    applyMixerSettingsToGraph,
    getInsertInputNodeForChannel,
  } = useMixerGraph(ensureContext);
  const lastMeterLevelsRef = useRef(new Map());
  const lastMeterWaveformRef = useRef(new Map());
  const lastMaximizerReductionRef = useRef(new Map());
  const lastMaximizerOutputDbRef = useRef(new Map());
  const lastMaximizerStereoMeterRef = useRef(new Map());
  const stopVisualTailUntilRef = useRef(0);
  const stopVisualTailStartedAtRef = useRef(0);
  const stopVisualTailStateRef = useRef(new Map());
  const spectrumTargetInsertIdRef = useRef(
    String(fxEditorTarget?.insertId || selectedInsertId || ""),
  );

  const { updateMixerMeters, resetMeterState } = useMixerMeters(
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




  useEffect(
    function () {
      channelsRef.current = channels;
    },
    [channels],
  );

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
      const masterInsert = (mixerSettingsRef.current || []).find(
        function (insert) {
          return insert?.isMaster || insert?.id === "master";
        },
      );
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

      const MIXER_METER_RMS_GAIN = 4.2;
      const MIXER_METER_PEAK_GAIN = 1.9;
      const MIXER_METER_NOISE_GATE = 0.0016;
      const MIXER_METER_RESPONSE_CURVE = 0.5;

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
        const level = Math.min(1, Math.pow(gated, MIXER_METER_RESPONSE_CURVE));

        dispatch(
          setInsertMeter({
            insertId: "master",
            meter: level,
          }),
        );
      };

      if (!transport.isPlaying) {
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
      transport.isPlaying,
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
    [playPackBrowserPreview],
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

      const masterInsert = (mixerSettingsRef.current || []).find(
        function (insert) {
          return insert?.isMaster || insert?.id === "master";
        },
      );
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
    [mixerSettings],
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
    [mixerSettings, ensureMixerGraph, applyMixerSettingsToGraph],
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
    [channels, loadSampleBuffer],
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
    ],
  );

  useEffect(
    function () {
      const audioCtx = ensureContext();
      const sixteenth = 60 / transport.bpm / 4;

      const scheduleSample = function (
        sampleBuffer,
        time,
        gainAmount,
        panValue,
        channel,
        outputNode,
        midiPitch,
        noteLengthSteps,
      ) {
        const settings = getSafeSampleSettings(channel.sampleSettings);

        const getNormalizeGain = function () {
          if (!settings.normalize) {
            return 1;
          }

          const cached = sampleNormalizeGainRef.current.get(sampleBuffer);
          if (Number.isFinite(cached)) {
            return cached;
          }

          let peak = 0;
          const channelsCount = Math.max(
            1,
            Number(sampleBuffer.numberOfChannels || 1),
          );

          for (let ch = 0; ch < channelsCount; ch += 1) {
            const channelData = sampleBuffer.getChannelData(ch);
            const step = Math.max(1, Math.floor(channelData.length / 64000));

            for (let i = 0; i < channelData.length; i += step) {
              const abs = Math.abs(channelData[i]);
              if (abs > peak) {
                peak = abs;
              }
            }
          }

          const normalized =
            peak > 0.0001 ? Math.max(0.25, Math.min(4, 0.9 / peak)) : 1;

          sampleNormalizeGainRef.current.set(sampleBuffer, normalized);
          return normalized;
        };

        if (settings.cutItself) {
          stopActiveChannelSamples(channel.id, time);
        }

        const safeMidiPitch = Number.isFinite(midiPitch)
          ? midiPitch
          : DEFAULT_SAMPLE_MIDI_PITCH;
        const pitchRate = Math.pow(2, Number(settings.pitchCents || 0) / 1200);
        const basePlaybackRate = Math.max(
          0.125,
          Math.min(8, midiPitchToPlaybackRate(safeMidiPitch) * pitchRate),
        );
        const sampleReadDuration = Math.max(
          0.01,
          sampleBuffer.duration * (settings.lengthPct / 100),
        );
        const stretchProfile = getTimeStretchProfile(
          settings,
          sampleReadDuration,
          transport.bpm,
          basePlaybackRate,
        );

        const normalizeGain = settings.normalize ? getNormalizeGain() : null;
        const voiceParams = computeSamplePlaybackParams(
          sampleBuffer,
          settings,
          midiPitch,
          noteLengthSteps,
          sixteenth,
          normalizeGain,
          {
            playbackRate: stretchProfile.playbackRate,
            samplePlayableDuration: stretchProfile.useGranularStretch
              ? stretchProfile.targetDurationSec
              : undefined,
          },
        );

        let scheduledBuffer = sampleBuffer;
        if (stretchProfile.useGranularStretch) {
          const desiredBufferedDuration = Math.max(
            0.01,
            voiceParams.sourcePlayDuration * voiceParams.playbackRate,
          );
          const stretchFactor = clamp(
            sampleReadDuration / desiredBufferedDuration,
            0.25,
            4,
          );
          const readFrames = Math.max(
            16,
            Math.floor(sampleReadDuration * sampleBuffer.sampleRate),
          );
          const cacheKey =
            readFrames +
            "|" +
            stretchFactor.toFixed(4) +
            "|" +
            sampleBuffer.numberOfChannels;

          let perSampleCache =
            stretchedSampleBufferCacheRef.current.get(sampleBuffer);
          if (!perSampleCache) {
            perSampleCache = new Map();
            stretchedSampleBufferCacheRef.current.set(
              sampleBuffer,
              perSampleCache,
            );
          }

          const cached = perSampleCache.get(cacheKey);
          if (cached) {
            scheduledBuffer = cached;
          } else {
            scheduledBuffer = createWsolaStretchedBufferFromSample(
              audioCtx,
              sampleBuffer,
              sampleReadDuration,
              stretchFactor,
              false,
            );
            perSampleCache.set(cacheKey, scheduledBuffer);
          }
        }

        const finalGain = Math.max(0, gainAmount * (normalizeGain || 1));
        const { source, gain } = createSamplePlaybackNodes(
          audioCtx,
          scheduledBuffer,
          voiceParams,
          outputNode,
          time,
          panValue,
          finalGain,
          settings,
        );

        const channelVoices =
          activeSampleVoicesRef.current.get(channel.id) || new Set();
        if (!activeSampleVoicesRef.current.has(channel.id)) {
          activeSampleVoicesRef.current.set(channel.id, channelVoices);
        }

        const voice = { source, gain };
        channelVoices.add(voice);
        source.onended = function () {
          channelVoices.delete(voice);
          if (channelVoices.size === 0) {
            activeSampleVoicesRef.current.delete(channel.id);
          }
        };

        const requiredBufferDuration = Math.max(
          0.01,
          voiceParams.sourcePlayDuration * voiceParams.playbackRate,
        );
        source.start(
          time,
          0,
          Math.min(scheduledBuffer.duration, requiredBufferDuration),
        );
        source.stop(time + voiceParams.sourcePlayDuration + 0.005);
      };

      const schedulePlaylistAudioClip = function (
        sampleBuffer,
        time,
        outputNode,
        clipLengthSteps,
        clipOffsetSteps,
        channel,
      ) {
        if (!sampleBuffer) {
          return;
        }

        const source = audioCtx.createBufferSource();
        const gain = audioCtx.createGain();
        const panner = audioCtx.createStereoPanner();

        const settings = getSafeSampleSettings(channel?.sampleSettings);
        const clipOffsetSec = Math.max(
          0,
          Number(clipOffsetSteps || 0) * sixteenth,
        );
        const clipTotalDurationSec = Math.max(
          0.01,
          Number(clipLengthSteps || 1) * sixteenth,
        );
        const clipRemainingDurationSec = Math.max(
          0,
          clipTotalDurationSec - clipOffsetSec,
        );
        const sampleReadDuration = Math.max(
          0.01,
          Number(sampleBuffer.duration || 0) * (settings.lengthPct / 100),
        );
        const basePlaybackRate = Math.max(
          0.125,
          Math.min(8, Math.pow(2, Number(settings.pitchCents || 0) / 1200)),
        );
        const stretchProfile = getTimeStretchProfile(
          settings,
          sampleReadDuration,
          transport.bpm,
          basePlaybackRate,
        );
        const playbackRate = stretchProfile.playbackRate;
        const naturalPlayableDuration = Math.max(
          0.01,
          sampleReadDuration / playbackRate,
        );
        const totalPlayableDuration = Math.max(
          0.01,
          stretchProfile.useGranularStretch
            ? stretchProfile.targetDurationSec
            : naturalPlayableDuration,
        );
        const remainingPlayableDuration = Math.max(
          0,
          totalPlayableDuration - clipOffsetSec,
        );
        const playDuration = Math.max(
          0,
          Math.min(clipRemainingDurationSec, remainingPlayableDuration),
        );
        if (playDuration <= 0) {
          return;
        }

        const getNormalizeGain = function () {
          if (!settings.normalize) {
            return 1;
          }

          const cached = sampleNormalizeGainRef.current.get(sampleBuffer);
          if (Number.isFinite(cached)) {
            return cached;
          }

          let peak = 0;
          const channelsCount = Math.max(
            1,
            Number(sampleBuffer.numberOfChannels || 1),
          );

          for (let ch = 0; ch < channelsCount; ch += 1) {
            const channelData = sampleBuffer.getChannelData(ch);
            const step = Math.max(1, Math.floor(channelData.length / 64000));

            for (let i = 0; i < channelData.length; i += step) {
              const abs = Math.abs(channelData[i]);
              if (abs > peak) {
                peak = abs;
              }
            }
          }

          const normalized =
            peak > 0.0001 ? Math.max(0.25, Math.min(4, 0.9 / peak)) : 1;
          sampleNormalizeGainRef.current.set(sampleBuffer, normalized);
          return normalized;
        };

        let scheduledBuffer = sampleBuffer;
        let maxReadableDuration = sampleReadDuration;
        if (stretchProfile.useGranularStretch) {
          const desiredBufferedDuration = Math.max(
            0.01,
            totalPlayableDuration * playbackRate,
          );
          const stretchFactor = clamp(
            sampleReadDuration / desiredBufferedDuration,
            0.25,
            4,
          );
          const readFrames = Math.max(
            16,
            Math.floor(sampleReadDuration * sampleBuffer.sampleRate),
          );
          const cacheKey =
            readFrames +
            "|" +
            stretchFactor.toFixed(4) +
            "|" +
            sampleBuffer.numberOfChannels;

          let perSampleCache =
            stretchedSampleBufferCacheRef.current.get(sampleBuffer);
          if (!perSampleCache) {
            perSampleCache = new Map();
            stretchedSampleBufferCacheRef.current.set(
              sampleBuffer,
              perSampleCache,
            );
          }

          const cached = perSampleCache.get(cacheKey);
          if (cached) {
            scheduledBuffer = cached;
          } else {
            scheduledBuffer = createWsolaStretchedBufferFromSample(
              audioCtx,
              sampleBuffer,
              sampleReadDuration,
              stretchFactor,
              false,
            );
            perSampleCache.set(cacheKey, scheduledBuffer);
          }

          maxReadableDuration = Math.max(
            0.01,
            Math.min(scheduledBuffer.duration, desiredBufferedDuration),
          );
        }

        const sourceOffsetSec = clipOffsetSec * playbackRate;
        if (sourceOffsetSec >= maxReadableDuration) {
          return;
        }
        const sourceReadDuration = Math.max(
          0.01,
          Math.min(
            maxReadableDuration - sourceOffsetSec,
            playDuration * playbackRate,
          ),
        );

        const fadeOutAt = time + Math.max(0, playDuration - 0.012);
        const clipGain = Math.max(
          0.01,
          Number(channel?.volume ?? 0.75) * 0.36 * getNormalizeGain(),
        );
        const clipPan = clamp(Number(channel?.pan ?? 0), -1, 1);

        source.buffer = scheduledBuffer;
        source.playbackRate.setValueAtTime(playbackRate, time);
        gain.gain.setValueAtTime(clipGain, time);
        gain.gain.setValueAtTime(clipGain, fadeOutAt);
        gain.gain.linearRampToValueAtTime(0.0001, time + playDuration);
        panner.pan.setValueAtTime(clipPan, time);

        source.connect(gain);
        gain.connect(panner);
        panner.connect(outputNode);

        const voiceChannelId = channel?.id || "__playlist-audio__";
        const channelVoices =
          activeSampleVoicesRef.current.get(voiceChannelId) || new Set();
        if (!activeSampleVoicesRef.current.has(voiceChannelId)) {
          activeSampleVoicesRef.current.set(voiceChannelId, channelVoices);
        }

        const voice = { source, gain };
        channelVoices.add(voice);
        source.onended = function () {
          channelVoices.delete(voice);
          if (channelVoices.size === 0) {
            activeSampleVoicesRef.current.delete(voiceChannelId);
          }
        };

        source.start(time, sourceOffsetSec, sourceReadDuration);
        source.stop(time + playDuration + 0.005);
      };

      const schedulePluginInstrument = function (
        pluginRef,
        time,
        gainAmount,
        panValue,
        channel,
        outputNode,
        midiPitch,
        noteLengthSteps,
        channelSettings,
      ) {
        const rawPluginRef = String(pluginRef || "").trim();
        const key = getPluginInstrumentCacheKey(rawPluginRef, channel.id);
        const instrument = pluginInstrumentRef.current.get(key);
        if (!instrument) {
          if (!pluginInstrumentFailedRef.current.has(key)) {
            void loadPluginInstrument(rawPluginRef, channel.id, outputNode);
          }
          return;
        }

        routeInstrumentOutputToNode(instrument, outputNode);

        const safeMidiPitch = Number.isFinite(midiPitch)
          ? midiPitch
          : DEFAULT_SAMPLE_MIDI_PITCH;
        const transposedPitch = Math.max(
          0,
          Math.min(
            127,
            safeMidiPitch + Number(channelSettings.pitchCents || 0) / 100,
          ),
        );
        const attackSec = Math.max(
          0,
          Number(channelSettings.attackMs || 0) / 1000,
        );
        const releaseSec = Math.max(
          0,
          Number(channelSettings.releaseMs ?? 420) / 1000,
        );
        const noteDuration = Math.max(
          0.1,
          Number(noteLengthSteps || 1) * sixteenth * 0.95 + releaseSec,
        );
        const noteGain = Math.max(
          0,
          gainAmount * 2.2 * PLUGIN_INSTRUMENT_GAIN_BOOST,
        );

        if (channelSettings.monoMode) {
          stopActiveChannelSynthVoices(channel.id, time);
        }

        const routeVoiceToOutput = function (voice, destinationNode) {
          if (!voice || !destinationNode) {
            return;
          }

          const candidateNodes = [
            voice,
            voice.output,
            voice.gain,
            voice.gainNode,
            voice.node,
          ].filter(Boolean);

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
        };

        const voiceNode = instrument.play(transposedPitch, time, {
          duration: noteDuration,
          gain: noteGain,
          attack: attackSec,
          release: releaseSec,
          pan: Math.max(-1, Math.min(1, panValue)),
          destination: outputNode,
        });

        // Some soundfont implementations keep using their default destination.
        // Re-route the returned voice node explicitly to ensure mixer insert routing.
        routeVoiceToOutput(voiceNode, outputNode);

        if (!voiceNode || typeof voiceNode.stop !== "function") {
          return;
        }

        const channelVoices =
          activeSynthVoicesRef.current.get(channel.id) || new Set();
        if (!activeSynthVoicesRef.current.has(channel.id)) {
          activeSynthVoicesRef.current.set(channel.id, channelVoices);
        }

        const voice = { node: voiceNode };

        channelVoices.add(voice);

        const removeAfterMs = Math.max(
          40,
          Math.round((time - audioCtx.currentTime + noteDuration + 0.4) * 1000),
        );

        window.setTimeout(function () {
          channelVoices.delete(voice);
          if (channelVoices.size === 0) {
            activeSynthVoicesRef.current.delete(channel.id);
          }
        }, removeAfterMs);
      };

      const onSampleSettingsPreviewPlay = function (event) {
        const channelId = String(event?.detail?.channelId || "").trim();
        if (!channelId) {
          return;
        }

        const channel = (channelsRef.current || []).find(function (item) {
          return item.id === channelId;
        });
        if (!channel) {
          return;
        }

        const previewContext = ensureContext();
        if (previewContext.state === "suspended") {
          void previewContext.resume();
        }

        ensureMixerGraph();
        applyMixerSettingsToGraph();

        const outputNode = getInsertInputNodeForChannel(channel);
        const targetInsertId =
          String(channel.mixerInsertId || "master").trim() || "master";
        sampleSettingsPreviewMeterInsertIdRef.current = targetInsertId;

        const stopSampleSettingsPreviewMeterLoop = function () {
          if (sampleSettingsPreviewMeterRafRef.current) {
            cancelAnimationFrame(sampleSettingsPreviewMeterRafRef.current);
            sampleSettingsPreviewMeterRafRef.current = null;
          }
        };

        const startSampleSettingsPreviewMeterLoop = function () {
          if (transport.isPlaying) {
            return;
          }

          stopSampleSettingsPreviewMeterLoop();

          const tickPreviewMeters = function () {
            if (transport.isPlaying) {
              stopSampleSettingsPreviewMeterLoop();
              return;
            }

            const nowCtx = audioCtxRef.current || ensureContext();
            updateMixerMeters(nowCtx.currentTime);
            sampleSettingsPreviewMeterRafRef.current =
              requestAnimationFrame(tickPreviewMeters);
          };

          sampleSettingsPreviewMeterRafRef.current =
            requestAnimationFrame(tickPreviewMeters);
        };

        startSampleSettingsPreviewMeterLoop();

        const pluginRef = String(channel.pluginRef || "").trim();
        const plugin = getPluginInstrument(pluginRef);
        const hasPluginInstrument = Boolean(plugin && plugin.soundfont);

        const gainAmount =
          BASE_CHANNEL_TRIGGER_GAIN * clamp(Number(channel.volume ?? 1), 0, 1);

        const scheduleSampleSettingsPlugin = function () {
          const nowCtx = audioCtxRef.current || previewContext;
          const startAt = nowCtx.currentTime + 0.002;

          stopActiveChannelSamples(channel.id, startAt);
          stopActiveChannelSynthVoices(channel.id, startAt);

          schedulePluginInstrument(
            pluginRef,
            startAt,
            gainAmount,
            channel.pan,
            channel,
            outputNode,
            DEFAULT_SAMPLE_MIDI_PITCH,
            1,
            getSafeSampleSettings(channel.sampleSettings),
          );
        };

        const scheduleSampleSettingsSample = function (buffer) {
          if (!buffer) {
            return;
          }

          const nowCtx = audioCtxRef.current || previewContext;
          const startAt = nowCtx.currentTime + 0.002;

          stopActiveChannelSamples(channel.id, startAt);
          stopActiveChannelSynthVoices(channel.id, startAt);

          scheduleSample(
            buffer,
            startAt,
            gainAmount,
            channel.pan,
            channel,
            outputNode,
            DEFAULT_SAMPLE_MIDI_PITCH,
            1,
          );
        };

        if (hasPluginInstrument) {
          const key = getPluginInstrumentCacheKey(pluginRef, channel.id);
          const cachedInstrument = pluginInstrumentRef.current.get(key);
          if (cachedInstrument) {
            scheduleSampleSettingsPlugin();
            return;
          }

          void loadPluginInstrument(pluginRef, channel.id, outputNode).then(
            function (loadedInstrument) {
              if (!loadedInstrument) {
                return;
              }

              scheduleSampleSettingsPlugin();
            },
          );
          return;
        }

        const safeSampleRef = toSafeSampleUrl(channel.sampleRef);
        if (!safeSampleRef) {
          return;
        }

        const cached = sampleBufferCacheRef.current.get(safeSampleRef);
        if (cached) {
          scheduleSampleSettingsSample(cached);
          return;
        }

        if (!sampleLoadFailedRef.current.has(safeSampleRef)) {
          void loadSampleBuffer(safeSampleRef).then(
            scheduleSampleSettingsSample,
          );
        }
      };

      const onSampleSettingsPreviewStop = function (event) {
        const channelId = String(event?.detail?.channelId || "").trim();
        if (!channelId || !audioCtxRef.current) {
          return;
        }

        if (sampleSettingsPreviewMeterRafRef.current) {
          cancelAnimationFrame(sampleSettingsPreviewMeterRafRef.current);
          sampleSettingsPreviewMeterRafRef.current = null;
        }

        const stopAt = audioCtxRef.current.currentTime;
        stopActiveChannelSamples(channelId, stopAt);
        stopActiveChannelSynthVoices(channelId, stopAt);

        const insertId =
          sampleSettingsPreviewMeterInsertIdRef.current ||
          String(
            (channelsRef.current || []).find(function (item) {
              return item.id === channelId;
            })?.mixerInsertId || "master",
          );
        sampleSettingsPreviewMeterInsertIdRef.current = null;

        dispatch(
          setInsertMeter({
            insertId,
            meter: 0,
          }),
        );
        dispatch(
          setInsertMeter({
            insertId: "master",
            meter: 0,
          }),
        );
      };

      window.addEventListener(
        SAMPLE_SETTINGS_PREVIEW_PLAY_EVENT,
        onSampleSettingsPreviewPlay,
      );
      window.addEventListener(
        SAMPLE_SETTINGS_PREVIEW_STOP_EVENT,
        onSampleSettingsPreviewStop,
      );

      const removeSampleSettingsPreviewListeners = function () {
        if (sampleSettingsPreviewMeterRafRef.current) {
          cancelAnimationFrame(sampleSettingsPreviewMeterRafRef.current);
          sampleSettingsPreviewMeterRafRef.current = null;
        }

        window.removeEventListener(
          SAMPLE_SETTINGS_PREVIEW_PLAY_EVENT,
          onSampleSettingsPreviewPlay,
        );
        window.removeEventListener(
          SAMPLE_SETTINGS_PREVIEW_STOP_EVENT,
          onSampleSettingsPreviewStop,
        );
      };

      if (!transport.isPlaying) {
        if (audioCtxRef.current) {
          stopAllActiveSamples(audioCtxRef.current.currentTime);
        }

        stepRef.current = 0;
        const hasVisualTailContext = Boolean(
          audioCtxRef.current && mixerGraphRef.current,
        );
        if (!hasVisualTailContext) {
          if (rafIdRef.current) {
            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
          }
          resetMeterState();
          stopVisualTailUntilRef.current = 0;
          return function () {
            removeSampleSettingsPreviewListeners();
          };
        }

        const nowPerf = performance.now();
        if (stopVisualTailUntilRef.current <= nowPerf) {
          const waveformTailDurationMs = 2500;
          stopVisualTailStartedAtRef.current = nowPerf;
          stopVisualTailUntilRef.current = nowPerf + waveformTailDurationMs;
          stopVisualTailStateRef.current = new Map();
          mixerSettingsRef.current.forEach(function (insert) {
            const insertId = insert.id;
            const outDb = Number(
              lastMaximizerOutputDbRef.current.get(insertId) || -96,
            );
            const stereo =
              lastMaximizerStereoMeterRef.current.get(insertId) || {
                leftVolumeDb: -96,
                leftReductionDb: 0,
                rightReductionDb: 0,
                rightVolumeDb: -96,
              };
            const lastWaveform = lastMeterWaveformRef.current.get(insertId);
            stopVisualTailStateRef.current.set(insertId, {
              meter: Number(lastMeterLevelsRef.current.get(insertId) || 0),
              reduction: Number(
                lastMaximizerReductionRef.current.get(insertId) || 0,
              ),
              outDb,
              stereo,
              initialMeter: Number(lastMeterLevelsRef.current.get(insertId) || 0),
              initialReduction: Number(
                lastMaximizerReductionRef.current.get(insertId) || 0,
              ),
              initialOutDb: outDb,
              initialLeftDb: Number(stereo.leftVolumeDb || -96),
              initialRightDb: Number(stereo.rightVolumeDb || -96),
              initialLeftReduction: Number(stereo.leftReductionDb || 0),
              initialRightReduction: Number(stereo.rightReductionDb || 0),
              waveform: Array.isArray(lastWaveform)
                ? lastWaveform.slice(0, 220)
                : Array.from({ length: 220 }).map(function () {
                    return 0;
                  }),
            });
          });
        }

        const tickStopVisuals = function () {
          const nowCtx = audioCtxRef.current;
          if (!nowCtx) {
            resetMeterState();
            stopVisualTailUntilRef.current = 0;
            stopVisualTailStartedAtRef.current = 0;
            stopVisualTailStateRef.current.clear();
            rafIdRef.current = null;
            return;
          }

          const nowPerfTick = performance.now();
          const tailDuration = Math.max(
            1,
            stopVisualTailUntilRef.current - stopVisualTailStartedAtRef.current,
          );
          const waveformProgress = clamp(
            (nowPerfTick - stopVisualTailStartedAtRef.current) / tailDuration,
            0,
            1,
          );
          const barProgress = clamp(
            (nowPerfTick - stopVisualTailStartedAtRef.current) / 900,
            0,
            1,
          );
          const fade = 1 - barProgress;

          mixerSettingsRef.current.forEach(function (insert) {
            const state = stopVisualTailStateRef.current.get(insert.id);
            if (!state) {
              return;
            }
            state.meter = state.initialMeter * fade;
            state.reduction = state.initialReduction * fade;
            state.outDb =
              state.initialOutDb + (-96 - state.initialOutDb) * barProgress;
            state.stereo = {
              leftVolumeDb:
                state.initialLeftDb + (-96 - state.initialLeftDb) * barProgress,
              leftReductionDb: state.initialLeftReduction * fade,
              rightReductionDb: state.initialRightReduction * fade,
              rightVolumeDb:
                state.initialRightDb + (-96 - state.initialRightDb) * barProgress,
            };
            state.waveform = [0, 0].concat(state.waveform.slice(0, 218));

            dispatch(
              setInsertMeter({
                insertId: insert.id,
                meter: state.meter,
                waveform: state.waveform,
                maximizerReduction: state.reduction,
                maximizerOutputDb: state.outDb,
                maximizerStereoMeter: state.stereo,
              }),
            );
          });

          if (waveformProgress < 1) {
            rafIdRef.current = requestAnimationFrame(tickStopVisuals);
            return;
          }

          resetMeterState();
          stopVisualTailUntilRef.current = 0;
          stopVisualTailStartedAtRef.current = 0;
          stopVisualTailStateRef.current.clear();
          rafIdRef.current = null;
        };

        if (!rafIdRef.current) {
          rafIdRef.current = requestAnimationFrame(tickStopVisuals);
        }

        return function () {
          removeSampleSettingsPreviewListeners();
          if (rafIdRef.current) {
            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
          }
        };
      }

      stopVisualTailUntilRef.current = 0;
      if (audioCtx.state === "suspended") {
        void audioCtx.resume();
      }

      ensureMixerGraph();
      applyMixerSettingsToGraph();

      const scheduleAhead = 0.11;

      const schedulePatternStep = function (
        pattern,
        patternStep,
        noteTime,
        options,
      ) {
        const currentChannels = channelsRef.current;
        const includeSustainFromStep = Boolean(options?.includeSustainFromStep);
        const sustainSourceStep = Math.max(
          0,
          Number(options?.sustainSourceStep ?? 0),
        );

        if (!pattern || !currentChannels) {
          return;
        }

        const patternLength = Math.max(1, pattern.lengthSteps || 16);
        const stepIndex =
          ((patternStep % patternLength) + patternLength) % patternLength;

        const soloChannels = currentChannels.filter(function (channel) {
          return channel.solo;
        });

        currentChannels.forEach(function (channel) {
          if (channel.muted) {
            return;
          }
          if (soloChannels.length > 0 && !channel.solo) {
            return;
          }

          const row = pattern.stepGrid[channel.id];
          const stepHit = Boolean(row && row[stepIndex]);

          const pianoNotes = pattern.pianoPreview?.[channel.id] || [];
          const noteHits = pianoNotes.reduce(function (acc, note) {
            const noteStart = Math.max(0, Number(note.start || 0));
            const noteLength = Math.max(0.0625, Number(note.length || 1));
            const noteEnd = noteStart + noteLength;
            const startStep = Math.floor(noteStart);
            if (startStep !== stepIndex) {
              if (!includeSustainFromStep) {
                return acc;
              }

              if (
                noteStart >= sustainSourceStep ||
                noteEnd <= sustainSourceStep
              ) {
                return acc;
              }

              acc.push({
                pitch: Math.round(note.pitch || DEFAULT_SAMPLE_MIDI_PITCH),
                velocity: Math.max(
                  1,
                  Math.min(
                    127,
                    Math.round(note.velocity || DEFAULT_NOTE_VELOCITY),
                  ),
                ),
                offsetSeconds: 0,
                lengthSteps: Math.max(0.0625, noteEnd - sustainSourceStep),
              });
              return acc;
            }

            const stepOffset = noteStart - startStep;
            acc.push({
              pitch: Math.round(note.pitch || DEFAULT_SAMPLE_MIDI_PITCH),
              velocity: Math.max(
                1,
                Math.min(
                  127,
                  Math.round(note.velocity || DEFAULT_NOTE_VELOCITY),
                ),
              ),
              offsetSeconds: Math.max(0, stepOffset * sixteenth),
              lengthSteps: noteLength,
            });
            return acc;
          }, []);

          if (!stepHit && noteHits.length === 0) {
            return;
          }

          const sampleRef = channel.sampleRef;
          const safeSampleRef = toSafeSampleUrl(sampleRef);
          const pluginRef = String(channel.pluginRef || "");
          const plugin = getPluginInstrument(pluginRef);
          const hasPluginInstrument = Boolean(plugin && plugin.soundfont);
          const channelSettings = getSafeSampleSettings(channel.sampleSettings);

          if (!safeSampleRef && !hasPluginInstrument) {
            return;
          }

          const outputNode = getInsertInputNodeForChannel(channel);
          const channelVolume = clamp(Number(channel.volume ?? 1), 0, 1);

          const playOneHit = function (
            midiPitch,
            offsetSeconds,
            lengthSteps,
            velocity,
          ) {
            const hitTime = noteTime + Math.max(0, Number(offsetSeconds || 0));
            const velocityScale = clamp(
              Number(velocity || DEFAULT_NOTE_VELOCITY) / 127,
              1 / 127,
              1,
            );
            const hitGain =
              BASE_CHANNEL_TRIGGER_GAIN * channelVolume * velocityScale;

            if (hasPluginInstrument) {
              schedulePluginInstrument(
                pluginRef,
                hitTime,
                hitGain,
                channel.pan,
                channel,
                outputNode,
                midiPitch,
                lengthSteps,
                channelSettings,
              );
              return;
            }

            const sampleBuffer =
              sampleBufferCacheRef.current.get(safeSampleRef);
            if (sampleBuffer) {
              scheduleSample(
                sampleBuffer,
                hitTime,
                hitGain,
                channel.pan,
                channel,
                outputNode,
                midiPitch,
                lengthSteps,
              );
              return;
            }

            if (!sampleLoadFailedRef.current.has(safeSampleRef)) {
              void loadSampleBuffer(safeSampleRef);
            }
          };

          if (stepHit) {
            playOneHit(DEFAULT_SAMPLE_MIDI_PITCH, 0, 1, DEFAULT_NOTE_VELOCITY);
          }

          noteHits.forEach(function (note) {
            playOneHit(
              note.pitch,
              note.offsetSeconds,
              note.lengthSteps,
              note.velocity,
            );
          });
        });
      };

      const getSongLengthInSteps = function () {
        const clips = playlistClipsRef.current || [];
        if (clips.length === 0) {
          return Math.max(1, activePatternRef.current?.lengthSteps || 16);
        }

        let maxSongStep = 16;
        clips.forEach(function (clip) {
          const clipStartStep = Math.max(
            0,
            Math.round((Number(clip.barStart || 1) - 1) * 16),
          );
          const clipLengthSteps = Math.max(
            1,
            Math.round(Number(clip.barLength || 1) * 16),
          );
          const clipEndStep = clipStartStep + clipLengthSteps;
          maxSongStep = Math.max(maxSongStep, clipEndStep);
        });

        return maxSongStep;
      };

      const scheduleSongStep = function (
        songStep,
        absoluteSongStep,
        songLengthSteps,
        noteTime,
      ) {
        const allPatterns = patternsRef.current || [];
        const clips = playlistClipsRef.current || [];
        if (clips.length === 0) {
          return;
        }

        const patternsById = allPatterns.reduce(function (acc, pattern) {
          acc[pattern.id] = pattern;
          return acc;
        }, {});

        clips.forEach(function (clip) {
          const clipType = String(clip.clipType || "pattern").toLowerCase();
          const isAudioClip =
            clipType === "audio" ||
            (String(clip.samplePath || "").trim().length > 0 &&
              String(clip.channelId || "").trim().length > 0);

          const pattern = patternsById[clip.patternId];
          const clipStartStep = Math.max(
            0,
            Math.round((Number(clip.barStart || 1) - 1) * 16),
          );
          const clipLengthSteps = Math.max(
            1,
            Math.round(Number(clip.barLength || 1) * 16),
          );
          const clipSourceOffsetSteps = Math.max(
            0,
            Number(clip.sourceOffsetSteps || 0),
          );
          const relativeStep = songStep - clipStartStep;

          if (relativeStep < 0 || relativeStep >= clipLengthSteps) {
            return;
          }

          if (isAudioClip) {
            const cycleIndex = Math.floor(absoluteSongStep / songLengthSteps);
            const absoluteClipStartStep =
              cycleIndex * songLengthSteps + clipStartStep;
            const alreadyScheduledAt = scheduledAudioClipStartRef.current.get(
              clip.id,
            );
            if (alreadyScheduledAt === absoluteClipStartStep) {
              return;
            }

            const clipChannel = (channelsRef.current || []).find(function (ch) {
              return ch.id === clip.channelId;
            });
            const samplePath = toSafeSampleUrl(
              clip.samplePath || clipChannel?.sampleRef,
            );
            if (!samplePath) {
              return;
            }

            const graph = mixerGraphRef.current;
            const outputNode = clipChannel
              ? getInsertInputNodeForChannel(clipChannel)
              : graph?.inserts?.get("master")?.inputGain ||
                audioCtx.destination;
            const audioClipBuffer =
              sampleBufferCacheRef.current.get(samplePath);

            if (audioClipBuffer) {
              schedulePlaylistAudioClip(
                audioClipBuffer,
                noteTime,
                outputNode,
                clipLengthSteps,
                clipSourceOffsetSteps + relativeStep,
                clipChannel,
              );
              scheduledAudioClipStartRef.current.set(
                clip.id,
                absoluteClipStartStep,
              );
            } else if (!sampleLoadFailedRef.current.has(samplePath)) {
              void loadSampleBuffer(samplePath);
            }

            return;
          }

          if (!pattern) {
            return;
          }

          const patternLength = Math.max(1, pattern.lengthSteps || 16);
          const patternStepWithOffset =
            Math.round(clipSourceOffsetSteps) + relativeStep;
          if (patternStepWithOffset >= patternLength) {
            return;
          }

          schedulePatternStep(pattern, patternStepWithOffset, noteTime, {
            includeSustainFromStep:
              relativeStep === 0 && clipSourceOffsetSteps > 0,
            sustainSourceStep: patternStepWithOffset,
          });
        });
      };

      nextNoteTimeRef.current = audioCtx.currentTime + 0.02;
      const playbackCycleLength =
        transportModeRef.current === "song"
          ? Math.max(1, getSongLengthInSteps())
          : Math.max(1, activePatternRef.current?.lengthSteps || 16);
      const requestedStartStep = Math.max(
        0,
        Math.round(Number(transport.currentStep16 || 0)),
      );
      if (transportModeRef.current === "song") {
        if (songLoopEnabledRef.current) {
          stepRef.current = requestedStartStep % playbackCycleLength;
        } else {
          stepRef.current = Math.min(
            playbackCycleLength - 1,
            requestedStartStep,
          );
        }
      } else {
        stepRef.current = requestedStartStep % playbackCycleLength;
      }
      startedAtRef.current =
        nextNoteTimeRef.current - stepRef.current * sixteenth;
      scheduledAudioClipStartRef.current.clear();

      const tick = function () {
        const now = audioCtx.currentTime;
        const transportMode = transportModeRef.current;
        const songLoopEnabled = songLoopEnabledRef.current;
        let reachedSongEnd = false;

        applyMixerSettingsToGraph();
        updateMixerMeters(now);

        while (nextNoteTimeRef.current < now + scheduleAhead) {
          if (transportMode === "song") {
            const songLength = Math.max(1, getSongLengthInSteps());
            if (!songLoopEnabled && stepRef.current >= songLength) {
              reachedSongEnd = true;
              break;
            }

            const currentSongStep = songLoopEnabled
              ? stepRef.current % songLength
              : stepRef.current;
            scheduleSongStep(
              currentSongStep,
              stepRef.current,
              songLength,
              nextNoteTimeRef.current,
            );
          } else {
            const patternLength = Math.max(
              1,
              activePatternRef.current?.lengthSteps || 16,
            );
            const currentStep = stepRef.current % patternLength;
            schedulePatternStep(
              activePatternRef.current,
              currentStep,
              nextNoteTimeRef.current,
            );
          }

          stepRef.current += 1;
          nextNoteTimeRef.current += sixteenth;
        }

        if (reachedSongEnd) {
          dispatch(setPlayheadStep(Math.max(0, getSongLengthInSteps() - 1)));
          dispatch(setPlaying(false));
          return;
        }

        const elapsed = now - startedAtRef.current;
        const uiLength =
          transportMode === "song"
            ? Math.max(1, getSongLengthInSteps())
            : Math.max(1, activePatternRef.current?.lengthSteps || 16);
        const elapsedSteps = Math.floor(elapsed / sixteenth);
        const uiStep =
          transportMode === "song"
            ? songLoopEnabled
              ? elapsedSteps % uiLength
              : Math.min(uiLength - 1, Math.max(0, elapsedSteps))
            : elapsedSteps % uiLength;
        dispatch(setPlayheadStep(uiStep));

        rafIdRef.current = requestAnimationFrame(tick);
      };

      rafIdRef.current = requestAnimationFrame(tick);

      return function () {
        removeSampleSettingsPreviewListeners();

        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
      };
    },
    // Intentionally omit transport.currentStep16: the scheduler initializes
    // the playhead offset once when playback starts and must not re-run when
    // the step changes mid-playback (that update happens inside the rAF loop).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      transport.isPlaying,
      transport.bpm,
      dispatch,
      applyMixerSettingsToGraph,
      ensureContext,
      ensureMixerGraph,
      getInsertInputNodeForChannel,
      loadSampleBuffer,
      loadPluginInstrument,
    ],
  );
}


