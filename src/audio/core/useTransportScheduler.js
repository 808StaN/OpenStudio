/**
 * @fileoverview useTransportScheduler — Transport playback scheduling,
 * pattern/song step dispatch, and the requestAnimationFrame loop.
 *
 * Extracted from useAudioScheduler.js to isolate the core scheduling
 * engine from mixer/preview/instrument setup.
 */

import { useEffect, useRef } from "react";
import { clamp } from "../../store/utils";
import { computeSamplePlaybackParams } from "./computeSamplePlaybackParams";
import { createSamplePlaybackNodes } from "./createSamplePlaybackNodes";
import {
  DEFAULT_SAMPLE_MIDI_PITCH,
  midiPitchToPlaybackRate,
} from "../domain/pitch";
import { getSafeSampleSettings } from "../domain/sampleSettings";
import { getTimeStretchProfile } from "../domain/timeStretch";
import { getPluginInstrument } from "../../data/pluginInstruments";
import { setPlayheadStep, setPlaying } from "../../store";
import { toSafeSampleUrl } from "../../utils/sampleUrl";
import { createWsolaStretchedBufferFromSample } from "../wsolaStretch";
import {
  getPluginInstrumentCacheKey,
  routeInstrumentOutputToNode,
} from "./usePluginInstruments";
import { useVisualTail } from "./useVisualTail";
import { useSampleSettingsPreview } from "./useSampleSettingsPreview";

const DEFAULT_NOTE_VELOCITY = 95;
const PLUGIN_INSTRUMENT_GAIN_BOOST = 1.5;
const BASE_CHANNEL_TRIGGER_GAIN = 0.75;
const SAMPLE_SETTINGS_PREVIEW_PLAY_EVENT =
  "openstudio:sample-settings-preview-play";
const SAMPLE_SETTINGS_PREVIEW_STOP_EVENT =
  "openstudio:sample-settings-preview-stop";

export function useTransportScheduler({
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
}) {
  const rafIdRef = useRef(null);
  const nextNoteTimeRef = useRef(0);
  const stepRef = useRef(0);
  const startedAtRef = useRef(0);
  const scheduledAudioClipStartRef = useRef(new Map());
  const scheduleSampleRef = useRef(null);
  const schedulePluginInstrumentRef = useRef(null);

  const {
    stopVisualTailUntilRef,
    startVisualTail,
    runVisualTailTick,
    resetVisualTail,
  } = useVisualTail();

  useSampleSettingsPreview({
    dispatch,
    audioCtxRef,
    ensureContext,
    mixerGraphRef,
    mixerSettingsRef,
    ensureMixerGraph,
    applyMixerSettingsToGraph,
    getInsertInputNodeForChannel,
    updateMixerMeters,
    stopActiveChannelSamples,
    stopActiveChannelSynthVoices,
    channelsRef,
    pluginInstrumentRef,
    pluginInstrumentFailedRef,
    loadPluginInstrument,
    sampleBufferCacheRef,
    sampleLoadFailedRef,
    loadSampleBuffer,
    transportIsPlaying: transport.isPlaying,
    scheduleSampleRef,
    schedulePluginInstrumentRef,
  });

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
        const pitchRate = Math.pow(
          2,
          Number(settings.pitchCents || 0) / 1200,
        );
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

      scheduleSampleRef.current = scheduleSample;

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
          Math.round(
            (time - audioCtx.currentTime + noteDuration + 0.4) * 1000,
          ),
        );

        window.setTimeout(function () {
          channelVoices.delete(voice);
          if (channelVoices.size === 0) {
            activeSynthVoicesRef.current.delete(channel.id);
          }
        }, removeAfterMs);
      };

      schedulePluginInstrumentRef.current = schedulePluginInstrument;

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
          resetVisualTail();
          return;
        }

        const nowPerf = performance.now();
        if (
          !stopVisualTailUntilRef.current ||
          stopVisualTailUntilRef.current <= nowPerf
        ) {
          startVisualTail(nowPerf, mixerSettingsRef, {
            lastMeterLevelsRef,
            lastMeterWaveformRef,
            lastMaximizerReductionRef,
            lastMaximizerOutputDbRef,
            lastMaximizerStereoMeterRef,
          });
        }

        if (!rafIdRef.current) {
          rafIdRef.current = requestAnimationFrame(function () {
            runVisualTailTick({
              nowPerfTick: performance.now(),
              audioCtxRef,
              mixerSettingsRef,
              resetMeterState,
              dispatch,
              rafIdRef,
            });
          });
        }

        return function () {
          if (rafIdRef.current) {
            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
          }
        };
      }

      resetVisualTail();
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
        const includeSustainFromStep = Boolean(
          options?.includeSustainFromStep,
        );
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
            const hitTime =
              noteTime + Math.max(0, Number(offsetSeconds || 0));
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
            playOneHit(
              DEFAULT_SAMPLE_MIDI_PITCH,
              0,
              1,
              DEFAULT_NOTE_VELOCITY,
            );
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
            const cycleIndex = Math.floor(
              absoluteSongStep / songLengthSteps,
            );
            const absoluteClipStartStep =
              cycleIndex * songLengthSteps + clipStartStep;
            const alreadyScheduledAt =
              scheduledAudioClipStartRef.current.get(clip.id);
            if (alreadyScheduledAt === absoluteClipStartStep) {
              return;
            }

            const clipChannel = (channelsRef.current || []).find(function (
              ch,
            ) {
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
            const audioClipBuffer = sampleBufferCacheRef.current.get(samplePath);

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
