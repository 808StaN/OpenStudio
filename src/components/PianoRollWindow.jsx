import { useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
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
  midiVelocityToPercent,
  moveByScaleStep,
  percentToMidiVelocity,
  quantizeBySnap,
} from "./piano-roll/pianoRollUtils";
import {
  DEFAULT_NOTE_VELOCITY,
  DEFAULT_ROW_HEIGHT,
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
  findVelocityCandidatesAtClientX as findVelocityCandidatesAtClientXFromUtils,
  getVelocityPercentFromClientY,
} from "./piano-roll/pianoRollVelocityUtils";
import { usePianoRollKeyboardShortcuts } from "./piano-roll/usePianoRollKeyboardShortcuts";
import { usePianoRollClipboardActions } from "./piano-roll/usePianoRollClipboardActions";
import { usePianoRollMenuDismiss } from "./piano-roll/usePianoRollMenuDismiss";
import { usePianoRollMidiIo } from "./piano-roll/usePianoRollMidiIo";
import { usePianoRollMidiDrop } from "./piano-roll/usePianoRollMidiDrop";
import { usePianoRollPreviewAudio } from "./piano-roll/usePianoRollPreviewAudio";
import {
  usePianoRollInitialViewport,
  usePianoRollPlayheadAnimation,
  usePianoRollPlayheadClock,
  usePianoRollPreventBrowserZoom,
} from "./piano-roll/usePianoRollViewportAndPlayhead";
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

  // Playhead and viewport side-effects are extracted to dedicated hooks to keep this component slimmer.
  usePianoRollPlayheadClock({
    playheadStep,
    playheadStepRef,
    playheadStepTimestampRef,
  });

  usePianoRollPlayheadAnimation({
    playheadRef,
    playheadStepRef,
    playheadStepTimestampRef,
    isPlaying,
    bpm,
    patternLength,
    stepWidth,
    clampFn: clamp,
  });

  usePianoRollInitialViewport({
    initializedViewportRef,
    gridWrapRef,
    keysRef,
    rowHeight,
    pitchMax: PITCH_MAX,
    c5Pitch: C5_PITCH,
    gridHeaderHeight: GRID_HEADER_HEIGHT,
  });

  usePianoRollPreventBrowserZoom({
    gridWrapRef,
    keysRef,
  });

  // Audio preview pipeline (sample/plugin one-shot playback) lives in dedicated hook.
  const { startPreviewNote } = usePianoRollPreviewAudio({
    activeChannel,
  });

  usePianoRollMenuDismiss({
    isSnapMenuOpen,
    isChannelMenuOpen,
    isScaleRootMenuOpen,
    isScaleTypeMenuOpen,
    snapMenuRef,
    channelMenuRef,
    scaleRootMenuRef,
    scaleTypeMenuRef,
    setIsSnapMenuOpen,
    setIsChannelMenuOpen,
    setIsScaleRootMenuOpen,
    setIsScaleTypeMenuOpen,
  });

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

  const {
    copySelectedNotes,
    deleteSelectedNotes,
    cutSelectedNotes,
    pasteClipboardNotes,
  } = usePianoRollClipboardActions({
    selectedNotes,
    activePatternId,
    activePattern,
    activeChannel,
    dispatch,
    patternLength,
    minFreeLength: MIN_FREE_LENGTH,
    pitchMin: PITCH_MIN,
    pitchMax: PITCH_MAX,
    defaultVelocity: DEFAULT_NOTE_VELOCITY,
    clampFn: clamp,
    makeIdFn: makeGeneratedNoteId,
    addPianoNotesBatchAction: addPianoNotesBatch,
    removePianoNotesBatchAction: removePianoNotesBatch,
    setSelectedNoteIds,
    setEditMode,
  });

  usePianoRollKeyboardShortcuts({
    activeChannel,
    patternId: activePatternId,
    channelId: activeChannel?.id || "",
    editMode,
    pianoNotes,
    selectedNotes,
    scalePitchClasses,
    pitchMin: PITCH_MIN,
    pitchMax: PITCH_MAX,
    setEditMode,
    setSelectedNoteIds,
    toSelectionId: getNoteSelectionId,
    copySelectedNotes,
    cutSelectedNotes,
    pasteClipboardNotes,
    deleteSelectedNotes,
    ensureNoteIsPiano,
    clampFn: clamp,
    moveByScaleStepFn: moveByScaleStep,
    onMoveSelectedNotes: function ({ patternId, channelId, moves }) {
      dispatch(
        movePianoNotesBatch({
          patternId,
          channelId,
          moves,
        }),
      );
    },
  });

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

  const { onPianoRollMidiDragOver, onPianoRollMidiDrop } = usePianoRollMidiDrop(
    {
      activePattern,
      activeChannel,
      activePatternId,
      patternLength,
      stepWidth,
      dispatch,
      clampFn: clamp,
      getGridPointerFromEvent,
      pasteMidiPatternToChannelAction: pasteMidiPatternToChannel,
      dataTransferHasMidiPatternPayloadFn: dataTransferHasMidiPatternPayload,
      dataTransferHasMidiFilePayloadFn: dataTransferHasMidiFilePayload,
      readMidiPatternFromDataTransferFn: readMidiPatternFromDataTransfer,
      readMidiFilePayloadFromDataTransferFn: readMidiFilePayloadFromDataTransfer,
      parseMidiArrayBufferToStepNotesFn: parseMidiArrayBufferToStepNotes,
      isMidiFileNameFn: isMidiFileName,
    },
  );

  const { onExportMidiClick, onImportMidiClick, onImportMidiFileChange } =
    usePianoRollMidiIo({
      midiImportInputRef,
      activePattern,
      activeChannel,
      activePatternId,
      bpm,
      dispatch,
      isMidiFileNameFn: isMidiFileName,
      parseMidiArrayBufferToStepNotesFn: parseMidiArrayBufferToStepNotes,
      extractMidiPatternNotesFn: extractMidiPatternNotes,
      triggerMidiDownloadFn: triggerMidiDownload,
      pasteMidiPatternToChannelAction: pasteMidiPatternToChannel,
    });

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
        // Track last previewed pitch to avoid retrigger spam while dragging.
        lastPreviewPitch: note.pitch,
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
        if (previewPitch !== dragSession.lastPreviewPitch) {
          dragSession.lastPreviewPitch = previewPitch;
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
    const nextVelocityPercent = getVelocityPercentFromClientY({
      clientY,
      laneRect: rect,
      clampFn: clamp,
    });
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
    return findVelocityCandidatesAtClientXFromUtils({
      clientX,
      velocityWrapElement: velocityWrapRef.current,
      selectedNotes,
      pianoNotes,
      stepWidth,
      patternLength,
      clampFn: clamp,
      fallbackNote,
      getSelectionId: getNoteSelectionId,
    });
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
        ? getVelocityPercentFromClientY({
            clientY: event.clientY,
            laneRect: velocityRect,
            clampFn: clamp,
          })
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
          lockVelocityPercent = getVelocityPercentFromClientY({
            clientY: moveEvent.clientY,
            laneRect: moveRect,
            clampFn: clamp,
          });
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
