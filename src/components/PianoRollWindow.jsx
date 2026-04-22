import Soundfont from "soundfont-player";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { getPluginInstrument } from "../data/pluginInstruments";
import {
  addPianoNotesBatch,
  removePianoNotesBatch,
  setActiveChannel,
  movePianoNotesBatch,
  movePianoNote,
  pasteMidiPatternToChannel,
  setPianoRollScale,
  setPianoNoteLength,
  setPianoNoteVelocity,
  togglePianoNote,
  toggleStep,
} from "../store";
import { toSafeSampleUrl } from "../utils/sampleUrl";
import { triggerMidiDownload } from "../utils/midiExport";
import {
  dataTransferHasMidiPatternPayload,
  extractMidiPatternNotes,
  readMidiPatternFromDataTransfer,
} from "../utils/midiPattern";
import {
  dataTransferHasMidiFilePayload,
  isMidiFileName,
  parseMidiArrayBufferToStepNotes,
  readMidiFilePayloadFromDataTransfer,
} from "../utils/midiImport";
import {
  C5_PITCH,
  getChannelMergedNotes,
} from "../utils/patternNotes";
import {
  clamp,
  getNoteSelectionId,
  isNearlyEqual,
  makeGeneratedNoteId,
  midiPitchToPlaybackRate,
  midiVelocityToPercent,
  moveByScaleStep,
  percentToMidiVelocity,
  quantizeBySnap,
} from "./piano-roll/pianoRollUtils";
import {
  DEFAULT_NOTE_VELOCITY,
  DEFAULT_ROW_HEIGHT,
  DEFAULT_SAMPLE_MIDI_PITCH,
  DEFAULT_STEP_WIDTH,
  GRID_HEADER_HEIGHT,
  MARQUEE_MIN_DRAG,
  MAX_STEP_WIDTH,
  MAX_VELOCITY_LANE_HEIGHT,
  MIN_FREE_LENGTH,
  MIN_STEP_WIDTH,
  MIN_VELOCITY_LANE_HEIGHT,
  PITCH_MAX,
  PITCH_MIN,
  SCALE_ROOTS,
  SCALE_TYPES,
  SNAP_EPSILON,
  SNAP_OPTIONS,
  STEPS_PER_BAR,
} from "./piano-roll/pianoRollConstants";
import {
  buildClipboardPastePayload,
  copySelectedNotesToClipboard,
} from "./piano-roll/pianoRollClipboard";
import { PianoRollToolbar } from "./piano-roll/PianoRollToolbar";
import { PianoRollEditorBody } from "./piano-roll/PianoRollEditorBody";

export function PianoRollWindow() {
  const dispatch = useDispatch();

  const activePatternId = useSelector(function (state) {
    return state.daw.project.activePatternId;
  });
  const activePattern = useSelector(function (state) {
    return state.daw.project.patterns.find(function (item) {
      return item.id === activePatternId;
    });
  });
  const channels = useSelector(function (state) {
    return state.daw.project.channels;
  });
  const activeChannelId = useSelector(function (state) {
    return state.daw.project.activeChannelId;
  });
  const bpm = useSelector(function (state) {
    return state.daw.transport.bpm;
  });
  const scaleRoot = useSelector(function (state) {
    return state.daw.ui.pianoRollScaleRoot || "C";
  });
  const scaleType = useSelector(function (state) {
    return state.daw.ui.pianoRollScaleType || "minor";
  });
  const isPlaying = useSelector(function (state) {
    return state.daw.transport.isPlaying;
  });
  const currentStep16 = useSelector(function (state) {
    return state.daw.transport.currentStep16;
  });

  const activeChannel =
    channels.find(function (channel) {
      return channel.id === activeChannelId;
    }) || channels[0];

  const patternLength = Math.max(4, activePattern?.lengthSteps || 16);
  const pianoNotes = getChannelMergedNotes(activePattern, activeChannel?.id);
  const resizeSessionRef = useRef(null);
  const gridWrapRef = useRef(null);
  const keysRef = useRef(null);
  const playheadRef = useRef(null);
  const playheadStepRef = useRef(0);
  const playheadStepTimestampRef = useRef(0);
  const lastTouchedLengthRef = useRef(1);
  const lastTouchedVelocityRef = useRef(DEFAULT_NOTE_VELOCITY);
  const isSyncingScrollRef = useRef(false);
  const isSyncingHorizontalScrollRef = useRef(false);
  const initializedViewportRef = useRef(false);
  const snapMenuRef = useRef(null);
  const channelMenuRef = useRef(null);
  const scaleRootMenuRef = useRef(null);
  const scaleTypeMenuRef = useRef(null);
  const midiImportInputRef = useRef(null);
  const dragSelectionRef = useRef(null);
  const velocityWrapRef = useRef(null);
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
  const velocityBrushActiveRef = useRef(false);
  const rowHeight = DEFAULT_ROW_HEIGHT;
  const [stepWidth, setStepWidth] = useState(DEFAULT_STEP_WIDTH);
  const [snapKey, setSnapKey] = useState("1-2-beat");
  const [isSnapMenuOpen, setIsSnapMenuOpen] = useState(false);
  const [isChannelMenuOpen, setIsChannelMenuOpen] = useState(false);
  const [isScaleRootMenuOpen, setIsScaleRootMenuOpen] = useState(false);
  const [isScaleTypeMenuOpen, setIsScaleTypeMenuOpen] = useState(false);
  const [editMode, setEditMode] = useState("add");
  const [selectedNoteIds, setSelectedNoteIds] = useState([]);
  const [selectionBox, setSelectionBox] = useState(null);
  const [velocityLaneHeight, setVelocityLaneHeight] = useState(150);
  const [velocityReadout, setVelocityReadout] = useState(
    midiVelocityToPercent(DEFAULT_NOTE_VELOCITY),
  );
  const [isVelocityLaneHovered, setIsVelocityLaneHovered] = useState(false);
  const [isVelocityEditing, setIsVelocityEditing] = useState(false);

  const activeSnap =
    SNAP_OPTIONS.find(function (option) {
      return option.key === snapKey;
    }) || SNAP_OPTIONS[9];
  const snapStepSize = activeSnap.stepSize;
  const minNoteLength = snapStepSize || MIN_FREE_LENGTH;
  const snapLineWidth = Math.max(1, (snapStepSize || 1) * stepWidth);
  const snapLineOpacity = snapStepSize ? 0.12 : 0;
  const scaleRootClass = SCALE_ROOTS.indexOf(scaleRoot);
  const activeScale =
    SCALE_TYPES.find(function (item) {
      return item.key === scaleType;
    }) || SCALE_TYPES[0];
  const scalePitchClasses = useMemo(
    function () {
      return new Set(
        activeScale.intervals.map(function (interval) {
          return (scaleRootClass + interval + 12) % 12;
        }),
      );
    },
    [activeScale, scaleRootClass],
  );

  const pitchRows = useMemo(function () {
    const rows = [];
    for (let pitch = PITCH_MAX; pitch >= PITCH_MIN; pitch -= 1) {
      rows.push(pitch);
    }
    return rows;
  }, []);

  const selectedNoteIdSet = useMemo(
    function () {
      return new Set(selectedNoteIds);
    },
    [selectedNoteIds],
  );

  const selectedNotes = useMemo(
    function () {
      return pianoNotes.filter(function (note) {
        return selectedNoteIdSet.has(getNoteSelectionId(note));
      });
    },
    [pianoNotes, selectedNoteIdSet],
  );

  const gridWidth = patternLength * stepWidth;
  const gridHeight = pitchRows.length * rowHeight;
  const totalBars = Math.max(1, Math.ceil(patternLength / STEPS_PER_BAR));
  const normalizedPlayheadStep =
    ((currentStep16 % patternLength) + patternLength) % patternLength;
  const playheadStep = isPlaying
    ? (normalizedPlayheadStep - 1 + patternLength) % patternLength
    : normalizedPlayheadStep;

  useEffect(
    function () {
      if (playheadStepRef.current === playheadStep) {
        return;
      }

      playheadStepRef.current = playheadStep;
      playheadStepTimestampRef.current = performance.now();
    },
    [playheadStep],
  );

  useEffect(
    function () {
      const playheadElement = playheadRef.current;
      if (!playheadElement) {
        return;
      }

      const setPlayheadPosition = function (positionPx) {
        playheadElement.style.transform = "translateX(" + positionPx + "px)";
      };

      const currentBaseStep =
        ((playheadStepRef.current % patternLength) + patternLength) %
        patternLength;

      if (!isPlaying) {
        setPlayheadPosition(currentBaseStep * stepWidth);
        return;
      }

      if (playheadStepTimestampRef.current <= 0) {
        playheadStepTimestampRef.current = performance.now();
      }

      let rafId = 0;
      const stepDurationMs = (60 / Math.max(1, bpm) / 4) * 1000;

      const tick = function () {
        const elapsed = performance.now() - playheadStepTimestampRef.current;
        const progress = clamp(elapsed / stepDurationMs, 0, 0.999);
        const baseStep =
          ((playheadStepRef.current % patternLength) + patternLength) %
          patternLength;
        setPlayheadPosition((baseStep + progress) * stepWidth);
        rafId = requestAnimationFrame(tick);
      };

      tick();

      return function () {
        cancelAnimationFrame(rafId);
      };
    },
    [isPlaying, bpm, patternLength, stepWidth],
  );

  useEffect(
    function () {
      if (initializedViewportRef.current) {
        return;
      }

      const viewport = gridWrapRef.current;
      if (!viewport) {
        return;
      }

      const c5RowIndex = Math.max(0, PITCH_MAX - C5_PITCH);
      const targetScrollTop = Math.max(
        0,
        c5RowIndex * rowHeight -
          viewport.clientHeight * 0.45 +
          GRID_HEADER_HEIGHT,
      );
      viewport.scrollTop = targetScrollTop;

      if (keysRef.current) {
        keysRef.current.scrollTop = targetScrollTop;
      }

      initializedViewportRef.current = true;
    },
    [rowHeight],
  );

  useEffect(function () {
    const viewport = gridWrapRef.current;
    const keys = keysRef.current;

    const preventBrowserZoom = function (event) {
      if (!event.ctrlKey) {
        return;
      }
      event.preventDefault();
    };

    const options = { passive: false };

    if (viewport) {
      viewport.addEventListener("wheel", preventBrowserZoom, options);
    }
    if (keys) {
      keys.addEventListener("wheel", preventBrowserZoom, options);
    }

    return function () {
      if (viewport) {
        viewport.removeEventListener("wheel", preventBrowserZoom, options);
      }
      if (keys) {
        keys.removeEventListener("wheel", preventBrowserZoom, options);
      }
    };
  }, []);

  const clearPreviewStopListeners = useCallback(function () {
    const listeners = previewStopListenersRef.current;
    if (!listeners) {
      return;
    }

    window.removeEventListener("mouseup", listeners.onMouseUp);
    window.removeEventListener("blur", listeners.onBlur);
    previewStopListenersRef.current = null;
  }, []);

  const stopPreviewNote = useCallback(
    function () {
      previewTokenRef.current += 1;
      previewPitchRef.current = null;
      previewChannelKeyRef.current = "";
      clearPreviewStopListeners();

      const voice = previewVoiceRef.current;
      previewVoiceRef.current = null;
      if (!voice) {
        return;
      }

      const context = previewAudioContextRef.current;
      if (!context) {
        return;
      }

      const now = context.currentTime;
      if (voice.type === "plugin") {
        try {
          voice.node.stop(now + 0.005);
          return;
        } catch {
          try {
            voice.node.stop();
          } catch {
            return;
          }
          return;
        }
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

  const ensurePreviewContext = useCallback(function () {
    if (!previewAudioContextRef.current) {
      previewAudioContextRef.current = new AudioContext();
    }

    return previewAudioContextRef.current;
  }, []);

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

  useEffect(
    function () {
      return function () {
        stopPreviewNote();
      };
    },
    [stopPreviewNote],
  );

  useEffect(
    function () {
      if (
        !isSnapMenuOpen &&
        !isChannelMenuOpen &&
        !isScaleRootMenuOpen &&
        !isScaleTypeMenuOpen
      ) {
        return;
      }

      const onPointerDown = function (event) {
        const target = event.target;
        if (
          snapMenuRef.current &&
          !snapMenuRef.current.contains(target) &&
          isSnapMenuOpen
        ) {
          setIsSnapMenuOpen(false);
        }

        if (
          channelMenuRef.current &&
          !channelMenuRef.current.contains(target) &&
          isChannelMenuOpen
        ) {
          setIsChannelMenuOpen(false);
        }

        if (
          scaleRootMenuRef.current &&
          !scaleRootMenuRef.current.contains(target) &&
          isScaleRootMenuOpen
        ) {
          setIsScaleRootMenuOpen(false);
        }

        if (
          scaleTypeMenuRef.current &&
          !scaleTypeMenuRef.current.contains(target) &&
          isScaleTypeMenuOpen
        ) {
          setIsScaleTypeMenuOpen(false);
        }
      };

      window.addEventListener("mousedown", onPointerDown);

      return function () {
        window.removeEventListener("mousedown", onPointerDown);
      };
    },
    [isSnapMenuOpen, isChannelMenuOpen, isScaleRootMenuOpen, isScaleTypeMenuOpen],
  );

  const onGridWrapScroll = function (event) {
    if (velocityWrapRef.current && !isSyncingHorizontalScrollRef.current) {
      isSyncingHorizontalScrollRef.current = true;
      velocityWrapRef.current.scrollLeft = event.currentTarget.scrollLeft;
      isSyncingHorizontalScrollRef.current = false;
    }

    if (!keysRef.current || isSyncingScrollRef.current) {
      return;
    }
    isSyncingScrollRef.current = true;
    keysRef.current.scrollTop = event.currentTarget.scrollTop;
    isSyncingScrollRef.current = false;
  };

  const onVelocityWrapScroll = function (event) {
    if (!gridWrapRef.current || isSyncingHorizontalScrollRef.current) {
      return;
    }

    isSyncingHorizontalScrollRef.current = true;
    gridWrapRef.current.scrollLeft = event.currentTarget.scrollLeft;
    isSyncingHorizontalScrollRef.current = false;
  };

  const onKeysScroll = function (event) {
    if (!gridWrapRef.current || isSyncingScrollRef.current) {
      return;
    }
    isSyncingScrollRef.current = true;
    gridWrapRef.current.scrollTop = event.currentTarget.scrollTop;
    isSyncingScrollRef.current = false;
  };

  const onGridWheel = function (event) {
    const viewport = gridWrapRef.current;
    if (!viewport) {
      return;
    }

    if (!event.ctrlKey) {
      return;
    }

    const rect = viewport.getBoundingClientRect();
    const pointerX = clamp(event.clientX - rect.left, 0, viewport.clientWidth);

    event.preventDefault();
    const previousWidth = stepWidth;
    const nextWidth = clamp(
      previousWidth + (event.deltaY < 0 ? 2 : -2),
      MIN_STEP_WIDTH,
      MAX_STEP_WIDTH,
    );

    if (nextWidth === previousWidth) {
      return;
    }

    const worldX = viewport.scrollLeft + pointerX;
    const stepPosition = worldX / previousWidth;

    setStepWidth(nextWidth);

    requestAnimationFrame(function () {
      viewport.scrollLeft = Math.max(0, stepPosition * nextWidth - pointerX);
      if (keysRef.current) {
        keysRef.current.scrollTop = viewport.scrollTop;
      }
    });
  };

  const getGridPointerFromEvent = function (event) {
    const viewport = gridWrapRef.current;
    if (!viewport) {
      return null;
    }

    const rect = viewport.getBoundingClientRect();
    const x = event.clientX - rect.left + viewport.scrollLeft;
    const y =
      event.clientY - rect.top + viewport.scrollTop - GRID_HEADER_HEIGHT;

    return {
      x,
      y,
      viewport,
    };
  };

  const removeNote = function (note) {
    if (!activeChannel) {
      return;
    }

    if (note.source === "step") {
      dispatch(
        toggleStep({
          patternId: activePatternId,
          channelId: activeChannel.id,
          stepIndex: Math.round(note.start),
        }),
      );
      return;
    }

    dispatch(
      togglePianoNote({
        patternId: activePatternId,
        channelId: activeChannel.id,
        start: note.start,
        pitch: note.pitch,
        length: note.length,
      }),
    );
  };

  const ensureNoteIsPiano = function (note) {
    if (!activeChannel) {
      return note;
    }

    if (note.source !== "step") {
      return note;
    }

    dispatch(
      toggleStep({
        patternId: activePatternId,
        channelId: activeChannel.id,
        stepIndex: Math.round(note.start),
      }),
    );

    const generatedId = makeGeneratedNoteId("conv");
    dispatch(
      togglePianoNote({
        patternId: activePatternId,
        channelId: activeChannel.id,
        id: generatedId,
        start: note.start,
        pitch: note.pitch,
        length: note.length,
        velocity: Math.round(
          clamp(Number(note.velocity || DEFAULT_NOTE_VELOCITY), 1, 127),
        ),
      }),
    );

    return {
      ...note,
      source: "piano",
      id: generatedId,
    };
  };

  const copySelectedNotes = function () {
    copySelectedNotesToClipboard({
      selectedNotes,
      activePatternId,
      activeChannelId: activeChannel?.id || null,
      defaultVelocity: DEFAULT_NOTE_VELOCITY,
      clampFn: clamp,
    });
  };

  const deleteSelectedNotes = function () {
    if (!selectedNotes.length) {
      return;
    }

    if (activeChannel) {
      dispatch(
        removePianoNotesBatch({
          patternId: activePatternId,
          channelId: activeChannel.id,
          notes: selectedNotes.map(function (note) {
            return {
              id: note.id,
              source: note.source,
              start: note.start,
              pitch: note.pitch,
            };
          }),
        }),
      );
    }

    setSelectedNoteIds([]);
  };

  const cutSelectedNotes = function () {
    if (!selectedNotes.length) {
      return;
    }
    copySelectedNotes();
    deleteSelectedNotes();
  };

  const pasteClipboardNotes = function () {
    if (!activePattern || !activeChannel) {
      return;
    }

    const channelNotes = activePattern.pianoPreview?.[activeChannel.id] || [];
    const { notesToAdd, nextSelection } = buildClipboardPastePayload({
      activePatternId,
      activeChannelId: activeChannel.id,
      patternLength,
      minFreeLength: MIN_FREE_LENGTH,
      pitchMin: PITCH_MIN,
      pitchMax: PITCH_MAX,
      channelNotes,
      defaultVelocity: DEFAULT_NOTE_VELOCITY,
      clampFn: clamp,
      makeIdFn: makeGeneratedNoteId,
    });

    if (notesToAdd.length > 0) {
      dispatch(
        addPianoNotesBatch({
          patternId: activePatternId,
          channelId: activeChannel.id,
          notes: notesToAdd,
        }),
      );
    }

    if (nextSelection.length > 0) {
      setSelectedNoteIds(nextSelection);
      setEditMode("select");
    }
  };

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(
    function () {
      const onKeyDown = function (event) {
        const target = event.target;
        if (
          target instanceof HTMLElement &&
          (target.isContentEditable ||
            target.closest("input, textarea, [contenteditable='true']"))
        ) {
          return;
        }

        const hasSelection = selectedNotes.length > 0;
        const key = event.key.toLowerCase();
        const ctrlOrMeta = event.ctrlKey || event.metaKey;

        if (ctrlOrMeta && key === "a") {
          event.preventDefault();
          setEditMode("select");
          setSelectedNoteIds(
            pianoNotes.map(function (note) {
              return getNoteSelectionId(note);
            }),
          );
          return;
        }

        if (editMode !== "select") {
          return;
        }

        if (ctrlOrMeta && key === "c") {
          event.preventDefault();
          copySelectedNotes();
          return;
        }

        if (ctrlOrMeta && key === "x") {
          event.preventDefault();
          cutSelectedNotes();
          return;
        }

        if (ctrlOrMeta && key === "v") {
          event.preventDefault();
          pasteClipboardNotes();
          return;
        }

        if (event.key === "Delete" || event.key === "Backspace") {
          if (!hasSelection) {
            return;
          }
          event.preventDefault();
          deleteSelectedNotes();
          return;
        }

        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
          return;
        }

        if (!hasSelection || !activeChannel) {
          return;
        }

        event.preventDefault();

        const direction = event.key === "ArrowUp" ? 1 : -1;
        const moveByOctave = event.ctrlKey && !event.metaKey;
        const moveBySemitone = event.shiftKey;
        const fixedStep = moveByOctave ? 12 : moveBySemitone ? 1 : 0;
        const moved = selectedNotes.map(function (note) {
          return ensureNoteIsPiano(note);
        });

        const moves = [];

        moved.forEach(function (note) {
          const nextPitch =
            fixedStep > 0
              ? clamp(note.pitch + direction * fixedStep, PITCH_MIN, PITCH_MAX)
              : moveByScaleStep(
                  note.pitch,
                  direction,
                  scalePitchClasses,
                  PITCH_MIN,
                  PITCH_MAX,
                );

          if (nextPitch === note.pitch) {
            return;
          }

          moves.push({
            noteId: note.id,
            start: note.start,
            pitch: note.pitch,
            nextStart: note.start,
            nextPitch,
          });

          note.pitch = nextPitch;
        });

        if (moves.length > 0) {
          dispatch(
            movePianoNotesBatch({
              patternId: activePatternId,
              channelId: activeChannel.id,
              moves,
            }),
          );
        }

        setSelectedNoteIds(
          moved.map(function (note) {
            return "piano:" + note.id;
          }),
        );
      };

      window.addEventListener("keydown", onKeyDown);

      return function () {
        window.removeEventListener("keydown", onKeyDown);
      };
    },
    [
      activeChannel,
      activePattern,
      activePatternId,
      dispatch,
      editMode,
      pianoNotes,
      patternLength,
      playheadStep,
      scalePitchClasses,
      selectedNotes,
      snapStepSize,
    ],
  );
  /* eslint-enable react-hooks/exhaustive-deps */

  const onGridMouseDown = function (event) {
    if (!activeChannel || !activePattern) {
      return;
    }

    if (event.button !== 0 && event.button !== 2) {
      return;
    }

    const pointer = getGridPointerFromEvent(event);
    if (!pointer) {
      return;
    }

    const x = pointer.x;
    const y = pointer.y;

    if (y < 0) {
      return;
    }

    if (editMode === "select") {
      if (event.button !== 0) {
        return;
      }

      event.preventDefault();

      const startX = clamp(x, 0, gridWidth);
      const startY = clamp(y, 0, gridHeight);
      setSelectionBox({
        startX,
        startY,
        endX: startX,
        endY: startY,
      });

      const onMouseMove = function (moveEvent) {
        const movePointer = getGridPointerFromEvent(moveEvent);
        if (!movePointer) {
          return;
        }

        setSelectionBox(function (current) {
          if (!current) {
            return current;
          }

          return {
            ...current,
            endX: clamp(movePointer.x, 0, gridWidth),
            endY: clamp(movePointer.y, 0, gridHeight),
          };
        });
      };

      const onMouseUp = function (upEvent) {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);

        const upPointer = getGridPointerFromEvent(upEvent) || {
          x: startX,
          y: startY,
        };

        const endX = clamp(upPointer.x, 0, gridWidth);
        const endY = clamp(upPointer.y, 0, gridHeight);
        const minX = Math.min(startX, endX);
        const maxX = Math.max(startX, endX);
        const minY = Math.min(startY, endY);
        const maxY = Math.max(startY, endY);
        const wasClick =
          Math.abs(maxX - minX) < MARQUEE_MIN_DRAG &&
          Math.abs(maxY - minY) < MARQUEE_MIN_DRAG;

        if (wasClick) {
          setSelectedNoteIds([]);
          setSelectionBox(null);
          return;
        }

        const nextSelection = pianoNotes
          .filter(function (note) {
            const noteLeft = note.start * stepWidth + 1;
            const noteTop = (PITCH_MAX - note.pitch) * rowHeight + 2;
            const noteWidth = Math.max(8, note.length * stepWidth - 2);
            const noteHeight = Math.max(6, rowHeight - 4);
            const noteRight = noteLeft + noteWidth;
            const noteBottom = noteTop + noteHeight;

            const intersectsHorizontally =
              noteRight >= minX && noteLeft <= maxX;
            const intersectsVertically = noteBottom >= minY && noteTop <= maxY;
            return intersectsHorizontally && intersectsVertically;
          })
          .map(function (note) {
            return getNoteSelectionId(note);
          });

        setSelectedNoteIds(nextSelection);
        setSelectionBox(null);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
      return;
    }

    const stepIndex = Math.max(
      0,
      Math.min(patternLength - 1, Math.floor(x / stepWidth)),
    );
    const rawStart = clamp(x / stepWidth, 0, patternLength - MIN_FREE_LENGTH);
    const snappedStart = clamp(
      quantizeBySnap(rawStart, snapStepSize),
      0,
      patternLength - MIN_FREE_LENGTH,
    );
    const rowIndex = Math.max(
      0,
      Math.min(pitchRows.length - 1, Math.floor(y / rowHeight)),
    );
    const pitch = PITCH_MAX - rowIndex;

    const stepRow = activePattern.stepGrid?.[activeChannel.id] || [];
    const stepIsOn = Boolean(stepRow[stepIndex]);

    const customNotes = activePattern.pianoPreview?.[activeChannel.id] || [];
    const hasCustomNote = customNotes.some(function (note) {
      return (
        isNearlyEqual(note.start || 0, snappedStart) && note.pitch === pitch
      );
    });

    const maxNewLength = Math.max(
      MIN_FREE_LENGTH,
      patternLength - snappedStart,
    );
    const minNewLength = Math.min(MIN_FREE_LENGTH, maxNewLength);
    const lastTouchedLength = Math.max(
      MIN_FREE_LENGTH,
      Number(lastTouchedLengthRef.current || minNoteLength),
    );
    const nextCreatedLength = clamp(
      lastTouchedLength,
      minNewLength,
      maxNewLength,
    );
    const snappedStartIsStep = isNearlyEqual(snappedStart, stepIndex);
    const shouldUseStepCell =
      snappedStartIsStep && isNearlyEqual(nextCreatedLength, 1);

    if (pitch === C5_PITCH) {
      if (event.button === 0) {
        if (shouldUseStepCell) {
          if (!stepIsOn) {
            dispatch(
              toggleStep({
                patternId: activePatternId,
                channelId: activeChannel.id,
                stepIndex,
              }),
            );
          }
          void startPreviewNote(pitch);
          return;
        }

        if (!hasCustomNote) {
          if (stepIsOn && snappedStartIsStep) {
            dispatch(
              toggleStep({
                patternId: activePatternId,
                channelId: activeChannel.id,
                stepIndex,
              }),
            );
          }

          lastTouchedLengthRef.current = nextCreatedLength;
          dispatch(
            togglePianoNote({
              patternId: activePatternId,
              channelId: activeChannel.id,
              start: snappedStart,
              pitch,
              length: nextCreatedLength,
              velocity: lastTouchedVelocityRef.current,
            }),
          );
          void startPreviewNote(pitch);
        }
        return;
      }

      if (event.button === 2) {
        event.preventDefault();

        if (hasCustomNote) {
          dispatch(
            togglePianoNote({
              patternId: activePatternId,
              channelId: activeChannel.id,
              start: snappedStart,
              pitch,
              length: minNoteLength,
            }),
          );
          return;
        }

        if (stepIsOn) {
          dispatch(
            toggleStep({
              patternId: activePatternId,
              channelId: activeChannel.id,
              stepIndex,
            }),
          );
        }
      }

      return;
    }

    if (event.button === 0 && !hasCustomNote) {
      lastTouchedLengthRef.current = nextCreatedLength;
      dispatch(
        togglePianoNote({
          patternId: activePatternId,
          channelId: activeChannel.id,
          start: snappedStart,
          pitch,
          length: nextCreatedLength,
          velocity: lastTouchedVelocityRef.current,
        }),
      );
      void startPreviewNote(pitch);
    }

    if (event.button === 2 && hasCustomNote) {
      event.preventDefault();
      dispatch(
        togglePianoNote({
          patternId: activePatternId,
          channelId: activeChannel.id,
          start: snappedStart,
          pitch,
          length: minNoteLength,
        }),
      );
    }
  };

  const getDroppedMidiFile = function (dataTransfer) {
    const files = Array.from(dataTransfer?.files || []);
    return (
      files.find(function (file) {
        return isMidiFileName(file?.name);
      }) || null
    );
  };

  const onPianoRollMidiDragOver = function (event) {
    const hasMidiPatternType = dataTransferHasMidiPatternPayload(
      event.dataTransfer,
    );
    const hasMidiFileType = dataTransferHasMidiFilePayload(event.dataTransfer);
    const payload = readMidiPatternFromDataTransfer(event.dataTransfer);
    const midiFilePayload = readMidiFilePayloadFromDataTransfer(
      event.dataTransfer,
    );
    const droppedFile = getDroppedMidiFile(event.dataTransfer);

    if (
      hasMidiPatternType ||
      hasMidiFileType ||
      payload ||
      midiFilePayload ||
      droppedFile
    ) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  };

  const onPianoRollMidiDrop = async function (event) {
    if (!activePattern || !activeChannel) {
      return;
    }

    const payload = readMidiPatternFromDataTransfer(event.dataTransfer);

    const pointer = getGridPointerFromEvent(event);
    if (!pointer) {
      return;
    }

    event.preventDefault();

    const insertStep = clamp(
      Math.floor(pointer.x / stepWidth),
      0,
      patternLength - 1,
    );

    if (payload) {
      dispatch(
        pasteMidiPatternToChannel({
          patternId: activePatternId,
          channelId: activeChannel.id,
          insertStep,
          notes: payload.notes,
        }),
      );
      return;
    }

    const midiFilePayload = readMidiFilePayloadFromDataTransfer(
      event.dataTransfer,
    );
    if (midiFilePayload?.midiPath) {
      try {
        const response = await fetch(midiFilePayload.midiPath, {
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }

        const bytes = await response.arrayBuffer();
        const notes = parseMidiArrayBufferToStepNotes(bytes);
        if (notes.length === 0) {
          return;
        }

        dispatch(
          pasteMidiPatternToChannel({
            patternId: activePatternId,
            channelId: activeChannel.id,
            insertStep,
            notes,
          }),
        );
      } catch {
        return;
      }

      return;
    }

    const droppedFile = getDroppedMidiFile(event.dataTransfer);
    if (!droppedFile) {
      return;
    }

    try {
      const bytes = await droppedFile.arrayBuffer();
      const notes = parseMidiArrayBufferToStepNotes(bytes);
      if (notes.length === 0) {
        return;
      }

      dispatch(
        pasteMidiPatternToChannel({
          patternId: activePatternId,
          channelId: activeChannel.id,
          insertStep,
          notes,
        }),
      );
    } catch {
      return;
    }
  };

  const onExportMidiClick = function () {
    if (!activePattern || !activeChannel) {
      return;
    }

    const notes = extractMidiPatternNotes(activePattern, activeChannel.id);
    if (notes.length === 0) {
      return;
    }

    const fileName =
      String(activePattern.name || "pattern").trim() +
      "-" +
      String(activeChannel.name || "channel").trim();
    triggerMidiDownload(notes, bpm, fileName);
  };

  const onImportMidiClick = function () {
    if (!midiImportInputRef.current) {
      return;
    }

    midiImportInputRef.current.click();
  };

  const onImportMidiFileChange = async function (event) {
    const input = event.target;
    const file = input?.files?.[0] || null;

    if (!file || !isMidiFileName(file.name)) {
      if (input) {
        input.value = "";
      }
      return;
    }

    if (!activePattern || !activeChannel) {
      input.value = "";
      return;
    }

    try {
      const bytes = await file.arrayBuffer();
      const notes = parseMidiArrayBufferToStepNotes(bytes);
      if (notes.length === 0) {
        input.value = "";
        return;
      }

      dispatch(
        pasteMidiPatternToChannel({
          patternId: activePatternId,
          channelId: activeChannel.id,
          insertStep: 0,
          notes,
        }),
      );
    } catch {
      // Ignore unreadable MIDI files.
    }

    input.value = "";
  };

  const onNoteMouseDown = function (event, note) {
    event.stopPropagation();
    event.preventDefault();

    if (Number(note.length) > 0) {
      lastTouchedLengthRef.current = Number(note.length);
    }
    if (Number(note.velocity) > 0) {
      const touchedVelocity = Math.round(clamp(Number(note.velocity), 1, 127));
      lastTouchedVelocityRef.current = touchedVelocity;
      setVelocityReadout(midiVelocityToPercent(touchedVelocity));
    }

    if (event.button === 0) {
      void startPreviewNote(note.pitch);
    }

    const noteRect = event.currentTarget.getBoundingClientRect();
    const clickedNearRightEdge = noteRect.right - event.clientX <= 8;

    if (editMode === "select") {
      if (!activeChannel) {
        return;
      }

      const noteSelectionId = getNoteSelectionId(note);

      if (event.button === 2) {
        if (
          selectedNoteIdSet.has(noteSelectionId) &&
          selectedNotes.length > 1
        ) {
          deleteSelectedNotes();
          return;
        }

        removeNote(note);
        setSelectedNoteIds(function (current) {
          return current.filter(function (item) {
            return item !== noteSelectionId;
          });
        });
        return;
      }

      if (event.button !== 0) {
        return;
      }

      if (clickedNearRightEdge) {
        const session = {
          patternId: activePatternId,
          channelId: activeChannel.id,
          source: note.source,
          mode: "resize",
          start: note.start,
          pitch: note.pitch,
          length: note.length,
          originStart: note.start,
          originPitch: note.pitch,
          originLength: note.length,
          originX: event.clientX,
          originY: event.clientY,
          convertedStep: false,
        };

        resizeSessionRef.current = session;

        const ensureStepConverted = function () {
          const activeSession = resizeSessionRef.current;
          if (!activeSession) {
            return;
          }

          if (activeSession.source !== "step" || activeSession.convertedStep) {
            return;
          }

          dispatch(
            toggleStep({
              patternId: activeSession.patternId,
              channelId: activeSession.channelId,
              stepIndex: activeSession.start,
            }),
          );

          dispatch(
            togglePianoNote({
              patternId: activeSession.patternId,
              channelId: activeSession.channelId,
              start: activeSession.start,
              pitch: activeSession.pitch,
              length: activeSession.length,
              velocity: Math.round(
                clamp(Number(note.velocity || DEFAULT_NOTE_VELOCITY), 1, 127),
              ),
            }),
          );

          activeSession.source = "piano";
          activeSession.convertedStep = true;
        };

        const onMouseMove = function (moveEvent) {
          const activeSession = resizeSessionRef.current;
          if (!activeSession) {
            return;
          }

          const deltaStepsRaw =
            (moveEvent.clientX - activeSession.originX) / stepWidth;
          const maxLen = Math.max(
            MIN_FREE_LENGTH,
            patternLength - activeSession.start,
          );
          const minLen = Math.min(minNoteLength, maxLen);
          const rawEnd =
            activeSession.start + activeSession.originLength + deltaStepsRaw;
          const snappedEnd = snapStepSize
            ? quantizeBySnap(rawEnd, snapStepSize)
            : rawEnd;
          const nextLength = clamp(
            snappedEnd - activeSession.start,
            minLen,
            maxLen,
          );

          if (activeSession.source === "step") {
            if (nextLength <= 1) {
              return;
            }
            ensureStepConverted();
          }

          if (Math.abs(nextLength - activeSession.length) <= SNAP_EPSILON) {
            return;
          }

          dispatch(
            setPianoNoteLength({
              patternId: activeSession.patternId,
              channelId: activeSession.channelId,
              noteId: note.id,
              start: activeSession.start,
              pitch: activeSession.pitch,
              length: nextLength,
            }),
          );

          activeSession.length = nextLength;
          lastTouchedLengthRef.current = nextLength;
        };

        const onMouseUp = function () {
          resizeSessionRef.current = null;
          window.removeEventListener("mousemove", onMouseMove);
          window.removeEventListener("mouseup", onMouseUp);
        };

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        return;
      }

      const activeSelectionIds = selectedNoteIdSet.has(noteSelectionId)
        ? selectedNoteIds
        : [noteSelectionId];

      let notesToMove = pianoNotes.filter(function (item) {
        return activeSelectionIds.includes(getNoteSelectionId(item));
      });

      notesToMove = notesToMove.map(function (item) {
        return ensureNoteIsPiano(item);
      });

      const dragIds = notesToMove.map(function (item) {
        return "piano:" + item.id;
      });
      setSelectedNoteIds(dragIds);

      const session = {
        originX: event.clientX,
        originY: event.clientY,
        previewOriginPitch: note.pitch,
        notes: notesToMove.map(function (item) {
          return {
            id: item.id,
            start: item.start,
            pitch: item.pitch,
            length: item.length,
            originStart: item.start,
            originPitch: item.pitch,
          };
        }),
      };

      const anchorNote = session.notes.reduce(function (best, item) {
        if (!best) {
          return item;
        }

        if (item.originStart < best.originStart) {
          return item;
        }

        return best;
      }, null);

      session.anchorOriginStart = anchorNote ? anchorNote.originStart : 0;
      session.minDeltaSteps = session.notes.reduce(function (acc, item) {
        return Math.max(acc, -item.originStart);
      }, -Infinity);
      session.maxDeltaSteps = session.notes.reduce(function (acc, item) {
        const maxStart = Math.max(0, patternLength - item.length);
        return Math.min(acc, maxStart - item.originStart);
      }, Infinity);

      dragSelectionRef.current = session;

      const onMouseMove = function (moveEvent) {
        const dragSession = dragSelectionRef.current;
        if (!dragSession) {
          return;
        }

        const deltaStepsRaw =
          (moveEvent.clientX - dragSession.originX) / stepWidth;
        const anchorTargetStart = snapStepSize
          ? quantizeBySnap(
              dragSession.anchorOriginStart + deltaStepsRaw,
              snapStepSize,
            )
          : dragSession.anchorOriginStart + deltaStepsRaw;
        const deltaSteps = clamp(
          anchorTargetStart - dragSession.anchorOriginStart,
          dragSession.minDeltaSteps,
          dragSession.maxDeltaSteps,
        );
        const deltaRows = Math.round(
          (moveEvent.clientY - dragSession.originY) / rowHeight,
        );
        const previewPitch = clamp(
          dragSession.previewOriginPitch - deltaRows,
          PITCH_MIN,
          PITCH_MAX,
        );
        if (previewPitch !== previewPitchRef.current) {
          void startPreviewNote(previewPitch);
        }

        dragSession.moves = [];
        dragSession.notes.forEach(function (item) {
          const maxStart = Math.max(0, patternLength - item.length);
          const nextStart = clamp(item.originStart + deltaSteps, 0, maxStart);
          const nextPitch = Math.max(
            PITCH_MIN,
            Math.min(PITCH_MAX, item.originPitch - deltaRows),
          );

          if (
            isNearlyEqual(nextStart, item.start) &&
            nextPitch === item.pitch
          ) {
            return;
          }

          dragSession.moves.push({
            noteId: item.id,
            start: item.start,
            pitch: item.pitch,
            nextStart,
            nextPitch,
          });
        });

        if (Array.isArray(dragSession.moves) && dragSession.moves.length > 0) {
          dispatch(
            movePianoNotesBatch({
              patternId: activePatternId,
              channelId: activeChannel.id,
              moves: dragSession.moves,
            }),
          );

          dragSession.moves.forEach(function (move) {
            const target = dragSession.notes.find(function (item) {
              return item.id === move.noteId;
            });
            if (!target) {
              return;
            }

            target.start = move.nextStart;
            target.pitch = move.nextPitch;
          });
        }
      };

      const onMouseUp = function () {
        const dragSession = dragSelectionRef.current;
        dragSelectionRef.current = null;

        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);

        if (!dragSession) {
          return;
        }

        setSelectedNoteIds(
          dragSession.notes.map(function (item) {
            return "piano:" + item.id;
          }),
        );
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
      return;
    }

    if (event.button === 2) {
      if (!activeChannel) {
        return;
      }

      if (note.source === "step") {
        dispatch(
          toggleStep({
            patternId: activePatternId,
            channelId: activeChannel.id,
            stepIndex: note.start,
          }),
        );
        return;
      }

      dispatch(
        togglePianoNote({
          patternId: activePatternId,
          channelId: activeChannel.id,
          start: note.start,
          pitch: note.pitch,
          length: note.length,
        }),
      );
      return;
    }

    if (event.button !== 0) {
      return;
    }

    if (!activeChannel) {
      return;
    }

    const session = {
      patternId: activePatternId,
      channelId: activeChannel.id,
      source: note.source,
      mode: clickedNearRightEdge ? "resize" : "move",
      start: note.start,
      pitch: note.pitch,
      length: note.length,
      originStart: note.start,
      originPitch: note.pitch,
      originLength: note.length,
      originX: event.clientX,
      originY: event.clientY,
      convertedStep: false,
    };

    resizeSessionRef.current = session;

    const ensureStepConverted = function () {
      const activeSession = resizeSessionRef.current;
      if (!activeSession) {
        return;
      }

      if (activeSession.source !== "step" || activeSession.convertedStep) {
        return;
      }

      dispatch(
        toggleStep({
          patternId: activeSession.patternId,
          channelId: activeSession.channelId,
          stepIndex: activeSession.start,
        }),
      );

      dispatch(
        togglePianoNote({
          patternId: activeSession.patternId,
          channelId: activeSession.channelId,
          start: activeSession.start,
          pitch: activeSession.pitch,
          length: activeSession.length,
          velocity: Math.round(
            clamp(Number(note.velocity || DEFAULT_NOTE_VELOCITY), 1, 127),
          ),
        }),
      );

      activeSession.source = "piano";
      activeSession.convertedStep = true;
    };

    const onMouseMove = function (moveEvent) {
      const activeSession = resizeSessionRef.current;
      if (!activeSession) {
        return;
      }

      const deltaStepsRaw =
        (moveEvent.clientX - activeSession.originX) / stepWidth;

      if (activeSession.mode === "resize") {
        const maxLen = Math.max(
          MIN_FREE_LENGTH,
          patternLength - activeSession.start,
        );
        const minLen = Math.min(minNoteLength, maxLen);
        const rawEnd =
          activeSession.start + activeSession.originLength + deltaStepsRaw;
        const snappedEnd = snapStepSize
          ? quantizeBySnap(rawEnd, snapStepSize)
          : rawEnd;
        const nextLength = clamp(
          snappedEnd - activeSession.start,
          minLen,
          maxLen,
        );

        if (activeSession.source === "step") {
          if (nextLength <= 1) {
            return;
          }
          ensureStepConverted();
        }

        if (Math.abs(nextLength - activeSession.length) <= SNAP_EPSILON) {
          return;
        }

        dispatch(
          setPianoNoteLength({
            patternId: activeSession.patternId,
            channelId: activeSession.channelId,
            noteId: note.id,
            start: activeSession.start,
            pitch: activeSession.pitch,
            length: nextLength,
          }),
        );

        activeSession.length = nextLength;
        lastTouchedLengthRef.current = nextLength;
        return;
      }

      const deltaRows = Math.round(
        (moveEvent.clientY - activeSession.originY) / rowHeight,
      );
      const maxStart = Math.max(0, patternLength - activeSession.length);
      const nextStart = clamp(
        quantizeBySnap(activeSession.originStart + deltaStepsRaw, snapStepSize),
        0,
        maxStart,
      );
      const nextPitch = Math.max(
        PITCH_MIN,
        Math.min(PITCH_MAX, activeSession.originPitch - deltaRows),
      );

      if (
        nextStart === activeSession.start &&
        nextPitch === activeSession.pitch
      ) {
        return;
      }

      ensureStepConverted();

      if (nextPitch !== activeSession.pitch) {
        void startPreviewNote(nextPitch);
      }

      dispatch(
        movePianoNote({
          patternId: activeSession.patternId,
          channelId: activeSession.channelId,
          noteId: note.id,
          start: activeSession.start,
          pitch: activeSession.pitch,
          nextStart,
          nextPitch,
        }),
      );

      activeSession.start = nextStart;
      activeSession.pitch = nextPitch;
    };

    const onMouseUp = function () {
      resizeSessionRef.current = null;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const onVelocityResizeMouseDown = function (event) {
    event.preventDefault();

    const originY = event.clientY;
    const originHeight = velocityLaneHeight;

    const onMouseMove = function (moveEvent) {
      const delta = originY - moveEvent.clientY;
      setVelocityLaneHeight(
        clamp(
          originHeight + delta,
          MIN_VELOCITY_LANE_HEIGHT,
          MAX_VELOCITY_LANE_HEIGHT,
        ),
      );
    };

    const onMouseUp = function () {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const applyVelocityAtPointer = function (note, clientY) {
    if (!activeChannel || !velocityWrapRef.current) {
      return;
    }

    const rect = velocityWrapRef.current.getBoundingClientRect();
    const laneHeight = Math.max(1, rect.height);
    const y = clamp(clientY - rect.top, 0, laneHeight);
    const ratio = 1 - y / laneHeight;
    const nextVelocityPercent = Math.round(clamp(ratio * 100, 0, 100));
    const nextVelocityMidi = percentToMidiVelocity(nextVelocityPercent);

    const pianoTarget = ensureNoteIsPiano(note);
    const currentVelocityPercent = midiVelocityToPercent(
      Number(pianoTarget.velocity || DEFAULT_NOTE_VELOCITY),
    );

    setVelocityReadout(nextVelocityPercent);
    if (currentVelocityPercent === nextVelocityPercent) {
      return;
    }

    dispatch(
      setPianoNoteVelocity({
        patternId: activePatternId,
        channelId: activeChannel.id,
        noteId: pianoTarget.id,
        start: pianoTarget.start,
        pitch: pianoTarget.pitch,
        velocity: nextVelocityMidi,
      }),
    );

    lastTouchedVelocityRef.current = nextVelocityMidi;
  };

  const applyLockedVelocityPercent = function (note, lockedVelocityPercent) {
    if (!activeChannel) {
      return;
    }

    const safePercent = Math.round(clamp(lockedVelocityPercent, 0, 100));
    const nextVelocityMidi = percentToMidiVelocity(safePercent);
    const pianoTarget = ensureNoteIsPiano(note);
    const currentVelocityPercent = midiVelocityToPercent(
      Number(pianoTarget.velocity || DEFAULT_NOTE_VELOCITY),
    );

    setVelocityReadout(safePercent);
    if (currentVelocityPercent === safePercent) {
      return;
    }

    dispatch(
      setPianoNoteVelocity({
        patternId: activePatternId,
        channelId: activeChannel.id,
        noteId: pianoTarget.id,
        start: pianoTarget.start,
        pitch: pianoTarget.pitch,
        velocity: nextVelocityMidi,
      }),
    );

    lastTouchedVelocityRef.current = nextVelocityMidi;
  };

  const findVelocityCandidatesAtClientX = function (clientX, fallbackNote) {
    if (!velocityWrapRef.current) {
      return fallbackNote ? [fallbackNote] : [];
    }

    const candidateNotes =
      selectedNotes.length > 0 ? selectedNotes : pianoNotes;
    if (candidateNotes.length === 0) {
      return [];
    }

    const rect = velocityWrapRef.current.getBoundingClientRect();
    const worldX =
      clientX - rect.left + Number(velocityWrapRef.current.scrollLeft || 0);
    const stepPosition = clamp(
      worldX / Math.max(1, stepWidth),
      0,
      patternLength,
    );

    const covering = candidateNotes.filter(function (item) {
      const noteStart = Number(item.start || 0);
      const noteEnd = noteStart + Math.max(0.0625, Number(item.length || 1));
      return stepPosition >= noteStart && stepPosition <= noteEnd;
    });
    if (covering.length > 0) {
      return covering;
    }

    if (
      fallbackNote &&
      candidateNotes.some(function (item) {
        return getNoteSelectionId(item) === getNoteSelectionId(fallbackNote);
      })
    ) {
      return [fallbackNote];
    }

    const nearest = candidateNotes.reduce(function (best, item) {
      const center = Number(item.start || 0) + Number(item.length || 1) * 0.5;
      const distance = Math.abs(center - stepPosition);
      if (!best || distance < best.distance) {
        return {
          note: item,
          distance,
        };
      }
      return best;
    }, null);

    return nearest ? [nearest.note] : [];
  };

  const applyVelocityByPointer = function (
    clientX,
    clientY,
    fallbackNote,
    isMultiBrush,
    lockedVelocityPercent,
  ) {
    const targets = findVelocityCandidatesAtClientX(clientX, fallbackNote);
    if (!targets || targets.length === 0) {
      return;
    }

    const applyTargets = isMultiBrush ? targets : [targets[0]];
    applyTargets.forEach(function (target) {
      if (Number.isFinite(lockedVelocityPercent)) {
        applyLockedVelocityPercent(target, lockedVelocityPercent);
      } else {
        applyVelocityAtPointer(target, clientY);
      }
    });
  };

  const startVelocityBrush = function (event, fallbackNote) {
    event.preventDefault();
    event.stopPropagation();

    const isMultiBrush = Boolean(event.shiftKey);
    const velocityRect = velocityWrapRef.current
      ? velocityWrapRef.current.getBoundingClientRect()
      : null;
    let lockVelocityPercent =
      isMultiBrush && velocityRect
        ? Math.round(
            clamp(
              100 *
                (1 -
                  clamp(
                    (event.clientY - velocityRect.top) /
                      Math.max(1, velocityRect.height),
                    0,
                    1,
                  )),
              0,
              100,
            ),
          )
        : null;

    velocityBrushActiveRef.current = true;
    setIsVelocityEditing(true);

    applyVelocityByPointer(
      event.clientX,
      event.clientY,
      fallbackNote,
      isMultiBrush,
      lockVelocityPercent,
    );

    const onMouseMove = function (moveEvent) {
      const moveWantsLock = Boolean(moveEvent.shiftKey);
      if (moveWantsLock && !Number.isFinite(lockVelocityPercent)) {
        const moveRect = velocityWrapRef.current
          ? velocityWrapRef.current.getBoundingClientRect()
          : null;
        if (moveRect) {
          lockVelocityPercent = Math.round(
            clamp(
              100 *
                (1 -
                  clamp(
                    (moveEvent.clientY - moveRect.top) /
                      Math.max(1, moveRect.height),
                    0,
                    1,
                  )),
              0,
              100,
            ),
          );
        }
      }

      applyVelocityByPointer(
        moveEvent.clientX,
        moveEvent.clientY,
        null,
        moveWantsLock || isMultiBrush,
        lockVelocityPercent,
      );
    };

    const onMouseUp = function () {
      velocityBrushActiveRef.current = false;
      setIsVelocityEditing(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const onVelocityBarMouseDown = function (event, note) {
    startVelocityBrush(event, note);
  };

  return (
    <section className="piano-roll-shell">
      <PianoRollToolbar
        channelMenuRef={channelMenuRef}
        snapMenuRef={snapMenuRef}
        scaleRootMenuRef={scaleRootMenuRef}
        scaleTypeMenuRef={scaleTypeMenuRef}
        midiImportInputRef={midiImportInputRef}
        activeChannel={activeChannel}
        channels={channels}
        isChannelMenuOpen={isChannelMenuOpen}
        setIsChannelMenuOpen={setIsChannelMenuOpen}
        isSnapMenuOpen={isSnapMenuOpen}
        setIsSnapMenuOpen={setIsSnapMenuOpen}
        isScaleRootMenuOpen={isScaleRootMenuOpen}
        setIsScaleRootMenuOpen={setIsScaleRootMenuOpen}
        isScaleTypeMenuOpen={isScaleTypeMenuOpen}
        setIsScaleTypeMenuOpen={setIsScaleTypeMenuOpen}
        onSelectChannel={function (channelId) {
          dispatch(setActiveChannel(channelId));
        }}
        onImportMidiClick={onImportMidiClick}
        onExportMidiClick={onExportMidiClick}
        onImportMidiFileChange={onImportMidiFileChange}
        editMode={editMode}
        setEditMode={setEditMode}
        setSelectedNoteIds={setSelectedNoteIds}
        activeSnap={activeSnap}
        SNAP_OPTIONS={SNAP_OPTIONS}
        snapKey={snapKey}
        setSnapKey={setSnapKey}
        scaleRoot={scaleRoot}
        scaleType={scaleType}
        activeScale={activeScale}
        SCALE_ROOTS={SCALE_ROOTS}
        SCALE_TYPES={SCALE_TYPES}
        onSelectScaleRoot={function (noteName) {
          dispatch(
            setPianoRollScale({
              root: noteName,
              type: scaleType,
            }),
          );
        }}
        onSelectScaleType={function (typeKey) {
          dispatch(
            setPianoRollScale({
              root: scaleRoot,
              type: typeKey,
            }),
          );
        }}
      />

      <PianoRollEditorBody
        pitchRows={pitchRows}
        rowHeight={rowHeight}
        onGridWheel={onGridWheel}
        onKeysScroll={onKeysScroll}
        keysRef={keysRef}
        gridWrapRef={gridWrapRef}
        onGridWrapScroll={onGridWrapScroll}
        gridWidth={gridWidth}
        totalBars={totalBars}
        patternLength={patternLength}
        stepWidth={stepWidth}
        gridHeight={gridHeight}
        snapLineWidth={snapLineWidth}
        snapLineOpacity={snapLineOpacity}
        onPianoRollMidiDragOver={onPianoRollMidiDragOver}
        onPianoRollMidiDrop={onPianoRollMidiDrop}
        onGridMouseDown={onGridMouseDown}
        selectionBox={selectionBox}
        isPlaying={isPlaying}
        playheadRef={playheadRef}
        scalePitchClasses={scalePitchClasses}
        pianoNotes={pianoNotes}
        selectedNoteIdSet={selectedNoteIdSet}
        onNoteMouseDown={onNoteMouseDown}
        onVelocityResizeMouseDown={onVelocityResizeMouseDown}
        velocityLaneHeight={velocityLaneHeight}
        isVelocityLaneHovered={isVelocityLaneHovered}
        isVelocityEditing={isVelocityEditing}
        velocityReadout={velocityReadout}
        setIsVelocityLaneHovered={setIsVelocityLaneHovered}
        velocityBrushActiveRef={velocityBrushActiveRef}
        velocityWrapRef={velocityWrapRef}
        onVelocityWrapScroll={onVelocityWrapScroll}
        startVelocityBrush={startVelocityBrush}
        onVelocityBarMouseDown={onVelocityBarMouseDown}
      />
    </section>
  );
}
