import { useCallback, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { setInsertMeter, setPlayheadStep } from "../store";

const defaultSampleSettings = {
  cutItself: false,
  lengthPct: 100,
  fadeInPct: 0,
  fadeOutPct: 0,
};

const DEFAULT_SAMPLE_MIDI_PITCH = 72;

function midiPitchToPlaybackRate(midiPitch) {
  const semitoneOffset = midiPitch - DEFAULT_SAMPLE_MIDI_PITCH;
  const rawRate = Math.pow(2, semitoneOffset / 12);
  return Math.max(0.125, Math.min(8, rawRate));
}

function getSafeSampleSettings(raw) {
  const base = {
    ...defaultSampleSettings,
    ...(raw || {}),
  };

  const next = {
    cutItself: Boolean(base.cutItself),
    lengthPct: Math.max(5, Math.min(100, Number(base.lengthPct || 100))),
    fadeInPct: Math.max(0, Math.min(95, Number(base.fadeInPct || 0))),
    fadeOutPct: Math.max(0, Math.min(95, Number(base.fadeOutPct || 0))),
  };

  const fadeTotal = next.fadeInPct + next.fadeOutPct;
  if (fadeTotal > 98) {
    const scale = 98 / fadeTotal;
    next.fadeInPct = Math.max(0, Math.round(next.fadeInPct * scale));
    next.fadeOutPct = Math.max(0, Math.round(next.fadeOutPct * scale));
  }

  return next;
}

function areMixerSettingsEqual(prev, next) {
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

    const aRoutes = a.routesTo || [];
    const bRoutes = b.routesTo || [];
    if (aRoutes.length !== bRoutes.length) {
      return false;
    }

    for (let r = 0; r < aRoutes.length; r += 1) {
      if (aRoutes[r] !== bRoutes[r]) {
        return false;
      }
    }
  }

  return true;
}

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

function safeDisconnect(node) {
  if (!node) {
    return;
  }

  try {
    node.disconnect();
  } catch {
    return;
  }
}

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
      };
    });
  }, areMixerSettingsEqual);

  const audioCtxRef = useRef(null);
  const rafIdRef = useRef(null);
  const nextNoteTimeRef = useRef(0);
  const stepRef = useRef(0);
  const startedAtRef = useRef(0);
  const sampleBufferCacheRef = useRef(new Map());
  const sampleLoadPromiseRef = useRef(new Map());
  const sampleLoadFailedRef = useRef(new Set());
  const activeSampleVoicesRef = useRef(new Map());
  const channelsRef = useRef(channels);
  const activePatternRef = useRef(activePattern);
  const mixerSettingsRef = useRef(mixerSettings);
  const mixerGraphRef = useRef(null);
  const lastMeterDispatchAtRef = useRef(0);
  const lastMeterLevelsRef = useRef(new Map());

  const ensureContext = useCallback(function () {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  }, []);

  const loadSampleBuffer = useCallback(
    async function (sampleUrl) {
      if (!sampleUrl) {
        return null;
      }

      const cached = sampleBufferCacheRef.current.get(sampleUrl);
      if (cached) {
        return cached;
      }

      const pending = sampleLoadPromiseRef.current.get(sampleUrl);
      if (pending) {
        return pending;
      }

      const request = (async function () {
        const audioCtx = ensureContext();
        const response = await fetch(sampleUrl);
        if (!response.ok) {
          throw new Error("Sample request failed");
        }

        const data = await response.arrayBuffer();
        const decodedBuffer = await audioCtx.decodeAudioData(data.slice(0));
        sampleBufferCacheRef.current.set(sampleUrl, decodedBuffer);
        sampleLoadFailedRef.current.delete(sampleUrl);
        return decodedBuffer;
      })();

      sampleLoadPromiseRef.current.set(sampleUrl, request);

      try {
        return await request;
      } catch {
        sampleLoadFailedRef.current.add(sampleUrl);
        return null;
      } finally {
        sampleLoadPromiseRef.current.delete(sampleUrl);
      }
    },
    [ensureContext],
  );

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
          safeDisconnect(node.outputGain);
          safeDisconnect(node.analyser);
        });
      }

      const inserts = new Map();

      settings.forEach(function (insert) {
        const inputGain = audioCtx.createGain();
        const splitter = audioCtx.createChannelSplitter(2);
        const leftToLeft = audioCtx.createGain();
        const rightToLeft = audioCtx.createGain();
        const leftToRight = audioCtx.createGain();
        const rightToRight = audioCtx.createGain();
        const merger = audioCtx.createChannelMerger(2);
        const panner = audioCtx.createStereoPanner();
        const outputGain = audioCtx.createGain();
        const analyser = audioCtx.createAnalyser();

        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.72;

        inputGain.connect(splitter);

        splitter.connect(leftToLeft, 0);
        splitter.connect(rightToLeft, 1);
        splitter.connect(leftToRight, 0);
        splitter.connect(rightToRight, 1);

        leftToLeft.connect(merger, 0, 0);
        rightToLeft.connect(merger, 0, 0);
        leftToRight.connect(merger, 0, 1);
        rightToRight.connect(merger, 0, 1);

        merger.connect(panner);
        panner.connect(outputGain);
        outputGain.connect(analyser);

        inserts.set(insert.id, {
          inputGain,
          splitter,
          leftToLeft,
          rightToLeft,
          leftToRight,
          rightToRight,
          merger,
          panner,
          outputGain,
          analyser,
          meterData: new Uint8Array(analyser.fftSize),
          meterLevel: 0,
        });
      });

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
          node.analyser.connect(target.inputGain);
          hasConnectedRoute = true;
        });

        if (insert.isMaster || !hasConnectedRoute) {
          node.analyser.connect(audioCtx.destination);
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

  const applyMixerSettingsToGraph = useCallback(function () {
    const graph = mixerGraphRef.current;
    const audioCtx = audioCtxRef.current;
    if (!graph || !audioCtx) {
      return;
    }

    const now = audioCtx.currentTime;
    mixerSettingsRef.current.forEach(function (insert) {
      const node = graph.inserts.get(insert.id);
      if (!node) {
        return;
      }

      const targetFader = insert.active
        ? Math.max(0, Math.min(1.25, insert.fader))
        : 0;
      const targetPan = Math.max(-1, Math.min(1, insert.pan));
      const targetSeparation = Math.max(
        -1,
        Math.min(1, insert.stereoSeparation),
      );

      const width = 1 - targetSeparation;
      const directGain = 0.5 * (1 + width);
      const crossGain = 0.5 * (1 - width);

      node.leftToLeft.gain.setValueAtTime(directGain, now);
      node.rightToRight.gain.setValueAtTime(directGain, now);
      node.rightToLeft.gain.setValueAtTime(crossGain, now);
      node.leftToRight.gain.setValueAtTime(crossGain, now);

      node.panner.pan.setValueAtTime(targetPan, now);
      node.outputGain.gain.cancelScheduledValues(now);
      node.outputGain.gain.setValueAtTime(node.outputGain.gain.value, now);
      node.outputGain.gain.linearRampToValueAtTime(targetFader, now + 0.01);
    });
  }, []);

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
        if (!sampleBufferCacheRef.current.has(sampleRef)) {
          void loadSampleBuffer(sampleRef);
        }
      });
    },
    [channels, loadSampleBuffer],
  );

  useEffect(
    function () {
      const stopActiveChannelSamples = function (channelId, atTime) {
        const voices = activeSampleVoicesRef.current.get(channelId);
        if (!voices || voices.size === 0) {
          return;
        }

        voices.forEach(function (voice) {
          try {
            const nowGain = Math.max(0.0001, voice.gain.gain.value || 0.0001);
            voice.gain.gain.cancelScheduledValues(atTime);
            voice.gain.gain.setValueAtTime(nowGain, atTime);
            voice.gain.gain.linearRampToValueAtTime(0.0001, atTime + 0.01);
            voice.source.stop(atTime + 0.012);
          } catch {
            return;
          }
        });

        voices.clear();
      };

      const stopAllActiveSamples = function (atTime) {
        Array.from(activeSampleVoicesRef.current.keys()).forEach(
          function (channelId) {
            stopActiveChannelSamples(channelId, atTime);
          },
        );
      };

      const resetMeters = function () {
        lastMeterDispatchAtRef.current = 0;

        const graph = mixerGraphRef.current;
        if (graph) {
          graph.inserts.forEach(function (node) {
            node.meterLevel = 0;
          });
        }

        mixerSettingsRef.current.forEach(function (insert) {
          dispatch(
            setInsertMeter({
              insertId: insert.id,
              meter: 0,
            }),
          );
        });

        lastMeterLevelsRef.current.clear();
      };

      const updateMixerMeters = function (now) {
        if (now - lastMeterDispatchAtRef.current < 1 / 30) {
          return;
        }
        lastMeterDispatchAtRef.current = now;

        const graph = mixerGraphRef.current;
        if (!graph) {
          return;
        }

        graph.inserts.forEach(function (node, insertId) {
          node.analyser.getByteTimeDomainData(node.meterData);

          let squareSum = 0;
          for (let i = 0; i < node.meterData.length; i += 1) {
            const centered = (node.meterData[i] - 128) / 128;
            squareSum += centered * centered;
          }

          const rms = Math.sqrt(squareSum / node.meterData.length);
          const instantMeter = Math.min(1, rms * 3.3);
          node.meterLevel = Math.max(instantMeter, node.meterLevel * 0.86);

          const prevMeter = lastMeterLevelsRef.current.get(insertId);
          if (
            prevMeter === undefined ||
            Math.abs(prevMeter - node.meterLevel) > 0.018 ||
            (node.meterLevel < 0.01 && prevMeter >= 0.01)
          ) {
            lastMeterLevelsRef.current.set(insertId, node.meterLevel);
            dispatch(
              setInsertMeter({
                insertId,
                meter: node.meterLevel,
              }),
            );
          }
        });
      };

      const scheduleSample = function (
        sampleBuffer,
        time,
        gainAmount,
        panValue,
        channel,
        outputNode,
        midiPitch,
      ) {
        const source = audioCtx.createBufferSource();
        const gain = audioCtx.createGain();
        const panner = audioCtx.createStereoPanner();

        const settings = getSafeSampleSettings(channel.sampleSettings);
        const safeMidiPitch = Number.isFinite(midiPitch)
          ? midiPitch
          : DEFAULT_SAMPLE_MIDI_PITCH;
        const playbackRate = midiPitchToPlaybackRate(safeMidiPitch);

        if (settings.cutItself) {
          stopActiveChannelSamples(channel.id, time);
        }

        const sampleReadDuration = Math.max(
          0.01,
          sampleBuffer.duration * (settings.lengthPct / 100),
        );
        const playDuration = Math.max(0.01, sampleReadDuration / playbackRate);
        const fadeInSec = playDuration * (settings.fadeInPct / 100);
        const fadeOutSec = playDuration * (settings.fadeOutPct / 100);
        const fadeTotal = fadeInSec + fadeOutSec;
        const fadeScale =
          fadeTotal > playDuration * 0.98
            ? (playDuration * 0.98) / fadeTotal
            : 1;
        const finalFadeIn = fadeInSec * fadeScale;
        const finalFadeOut = fadeOutSec * fadeScale;
        const finalGain = Math.max(0.001, gainAmount);
        const sampleStopAt = time + playDuration;
        const fadeOutStart = Math.max(time, sampleStopAt - finalFadeOut);

        source.buffer = sampleBuffer;
        source.playbackRate.setValueAtTime(playbackRate, time);
        if (finalFadeIn > 0.001) {
          gain.gain.setValueAtTime(0.0001, time);
          gain.gain.linearRampToValueAtTime(finalGain, time + finalFadeIn);
        } else {
          gain.gain.setValueAtTime(finalGain, time);
        }

        gain.gain.setValueAtTime(finalGain, fadeOutStart);
        if (finalFadeOut > 0.001) {
          gain.gain.linearRampToValueAtTime(0.0001, sampleStopAt);
        } else {
          gain.gain.setValueAtTime(0.0001, sampleStopAt);
        }

        panner.pan.setValueAtTime(Math.max(-1, Math.min(1, panValue)), time);

        source.connect(gain);
        gain.connect(panner);
        panner.connect(outputNode);

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

        source.start(time, 0, Math.min(sampleReadDuration, sampleBuffer.duration));
        source.stop(sampleStopAt + 0.005);
      };

      if (!transport.isPlaying) {
        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }

        if (audioCtxRef.current) {
          stopAllActiveSamples(audioCtxRef.current.currentTime);
        }

        resetMeters();

        stepRef.current = 0;
        return;
      }

      const audioCtx = ensureContext();
      if (audioCtx.state === "suspended") {
        void audioCtx.resume();
      }

      ensureMixerGraph();
      applyMixerSettingsToGraph();

      const sixteenth = 60 / transport.bpm / 4;
      const scheduleAhead = 0.11;

      const scheduleStep = function (stepIndex, noteTime) {
        const pattern = activePatternRef.current;
        const currentChannels = channelsRef.current;

        if (!pattern || !currentChannels) {
          return;
        }

        const patternLength = Math.max(1, pattern.lengthSteps || 16);

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
          const noteHits = pianoNotes.filter(function (note) {
            const noteStart = Math.max(0, Number(note.start || 0));
            return Math.floor(noteStart) % patternLength === stepIndex;
          });

          if (!stepHit && noteHits.length === 0) {
            return;
          }

          const sampleRef = channel.sampleRef;
          if (!sampleRef) {
            return;
          }

          const gainAmount = 0.2 * channel.volume;
          const outputNode = getInsertInputNodeForChannel(channel);

          const playOneHit = function (midiPitch) {
            const sampleBuffer = sampleBufferCacheRef.current.get(sampleRef);
            if (sampleBuffer) {
              scheduleSample(
                sampleBuffer,
                noteTime,
                gainAmount,
                channel.pan,
                channel,
                outputNode,
                midiPitch,
              );
              return;
            }

            if (!sampleLoadFailedRef.current.has(sampleRef)) {
              void loadSampleBuffer(sampleRef);
            }
          };

          if (stepHit) {
            playOneHit(DEFAULT_SAMPLE_MIDI_PITCH);
          }

          noteHits.forEach(function (note) {
            playOneHit(Math.round(note.pitch || DEFAULT_SAMPLE_MIDI_PITCH));
          });
        });
      };

      nextNoteTimeRef.current = audioCtx.currentTime + 0.02;
      startedAtRef.current = nextNoteTimeRef.current;
      stepRef.current = 0;

      const tick = function () {
        const now = audioCtx.currentTime;

        applyMixerSettingsToGraph();
        updateMixerMeters(now);

        while (nextNoteTimeRef.current < now + scheduleAhead) {
          const patternLength = Math.max(
            1,
            activePatternRef.current?.lengthSteps || 16,
          );
          const currentStep = stepRef.current % patternLength;
          scheduleStep(currentStep, nextNoteTimeRef.current);

          stepRef.current += 1;
          nextNoteTimeRef.current += sixteenth;
        }

        const elapsed = now - startedAtRef.current;
        const uiPatternLength = Math.max(
          1,
          activePatternRef.current?.lengthSteps || 16,
        );
        const uiStep = Math.floor(elapsed / sixteenth) % uiPatternLength;
        dispatch(setPlayheadStep(uiStep));

        rafIdRef.current = requestAnimationFrame(tick);
      };

      rafIdRef.current = requestAnimationFrame(tick);

      return function () {
        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }

        resetMeters();
      };
    },
    [
      transport.isPlaying,
      transport.bpm,
      dispatch,
      applyMixerSettingsToGraph,
      ensureContext,
      ensureMixerGraph,
      getInsertInputNodeForChannel,
      loadSampleBuffer,
    ],
  );
}
