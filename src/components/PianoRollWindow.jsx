import { useDispatch } from "react-redux";
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
import { C5_PITCH } from "../utils/patternNotes";
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
import { usePianoRollKeyboardShortcuts } from "./piano-roll/usePianoRollKeyboardShortcuts";
import { usePianoRollClipboardActions } from "./piano-roll/usePianoRollClipboardActions";
import { usePianoRollMenuDismiss } from "./piano-roll/usePianoRollMenuDismiss";
import { usePianoRollMidiIo } from "./piano-roll/usePianoRollMidiIo";
import { usePianoRollMidiDrop } from "./piano-roll/usePianoRollMidiDrop";
import { usePianoRollGridMouseDown } from "./piano-roll/usePianoRollGridMouseDown";
import { usePianoRollNoteMouseDown } from "./piano-roll/usePianoRollNoteMouseDown";
import { usePianoRollVelocityEditing } from "./piano-roll/usePianoRollVelocityEditing";
import { usePianoRollNoteOps } from "./piano-roll/usePianoRollNoteOps";
import { usePianoRollPreviewAudio } from "./piano-roll/usePianoRollPreviewAudio";
import { usePianoRollScrollAndZoom } from "./piano-roll/usePianoRollScrollAndZoom";
import { usePianoRollDerivedState } from "./piano-roll/usePianoRollDerivedState";
import { usePianoRollStoreState } from "./piano-roll/usePianoRollStoreState";
import { usePianoRollToolbarActions } from "./piano-roll/usePianoRollToolbarActions";
import { usePianoRollUiState } from "./piano-roll/usePianoRollUiState";
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
  const {
    activePatternId,
    activePattern,
    channels,
    activeChannel,
    bpm,
    scaleRoot,
    scaleType,
    isPlaying,
    currentStep16,
    patternLength,
    pianoNotes,
  } = usePianoRollStoreState();
  const {
    resizeSessionRef,
    gridWrapRef,
    keysRef,
    playheadRef,
    playheadStepRef,
    playheadStepTimestampRef,
    lastTouchedLengthRef,
    lastTouchedVelocityRef,
    isSyncingScrollRef,
    isSyncingHorizontalScrollRef,
    initializedViewportRef,
    snapMenuRef,
    channelMenuRef,
    scaleRootMenuRef,
    scaleTypeMenuRef,
    midiImportInputRef,
    dragSelectionRef,
    velocityWrapRef,
    rowHeight,
    stepWidth,
    setStepWidth,
    snapKey,
    setSnapKey,
    isSnapMenuOpen,
    setIsSnapMenuOpen,
    isChannelMenuOpen,
    setIsChannelMenuOpen,
    isScaleRootMenuOpen,
    setIsScaleRootMenuOpen,
    isScaleTypeMenuOpen,
    setIsScaleTypeMenuOpen,
    editMode,
    setEditMode,
    selectedNoteIds,
    setSelectedNoteIds,
    selectionBox,
    setSelectionBox,
  } = usePianoRollUiState();

  const {
    activeSnap,
    snapStepSize,
    minNoteLength,
    snapLineWidth,
    snapLineOpacity,
    activeScale,
    scalePitchClasses,
    pitchRows,
    selectedNoteIdSet,
    selectedNotes,
    gridWidth,
    gridHeight,
    totalBars,
    playheadStep,
  } = usePianoRollDerivedState({
    scaleRoot,
    scaleType,
    snapKey,
    stepWidth,
    patternLength,
    rowHeight,
    pitchMin: PITCH_MIN,
    pitchMax: PITCH_MAX,
    pianoNotes,
    selectedNoteIds,
    currentStep16,
    isPlaying,
    scaleRoots: SCALE_ROOTS,
  });

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

  const { onGridWrapScroll, onVelocityWrapScroll, onKeysScroll, onGridWheel } =
    usePianoRollScrollAndZoom({
      gridWrapRef,
      keysRef,
      velocityWrapRef,
      isSyncingScrollRef,
      isSyncingHorizontalScrollRef,
      stepWidth,
      setStepWidth,
      minStepWidth: MIN_STEP_WIDTH,
      maxStepWidth: MAX_STEP_WIDTH,
      clampFn: clamp,
    });

  const { getGridPointerFromEvent, removeNote, ensureNoteIsPiano } =
    usePianoRollNoteOps({
      gridWrapRef,
      gridHeaderHeight: GRID_HEADER_HEIGHT,
      activeChannel,
      dispatch,
      activePatternId,
      defaultNoteVelocity: DEFAULT_NOTE_VELOCITY,
      clampFn: clamp,
      makeIdFn: makeGeneratedNoteId,
      toggleStepAction: toggleStep,
      togglePianoNoteAction: togglePianoNote,
    });

  // Velocity lane editing state/handlers are kept in a dedicated hook.
  const {
    velocityBrushActiveRef,
    velocityLaneHeight,
    velocityReadout,
    isVelocityLaneHovered,
    isVelocityEditing,
    setIsVelocityLaneHovered,
    setVelocityReadout,
    onVelocityResizeMouseDown,
    startVelocityBrush,
    onVelocityBarMouseDown,
  } = usePianoRollVelocityEditing({
    activeChannel,
    dispatch,
    activePatternId,
    velocityWrapRef,
    selectedNotes,
    pianoNotes,
    stepWidth,
    patternLength,
    defaultNoteVelocity: DEFAULT_NOTE_VELOCITY,
    minVelocityLaneHeight: MIN_VELOCITY_LANE_HEIGHT,
    maxVelocityLaneHeight: MAX_VELOCITY_LANE_HEIGHT,
    clampFn: clamp,
    midiVelocityToPercentFn: midiVelocityToPercent,
    percentToMidiVelocityFn: percentToMidiVelocity,
    ensureNoteIsPiano,
    lastTouchedVelocityRef,
    setPianoNoteVelocityAction: setPianoNoteVelocity,
    getSelectionId: getNoteSelectionId,
  });

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

  const { onGridMouseDown } = usePianoRollGridMouseDown({
    activeChannel,
    activePattern,
    activePatternId,
    editMode,
    patternLength,
    stepWidth,
    rowHeight,
    gridWidth,
    gridHeight,
    pitchRows,
    snapStepSize,
    minNoteLength,
    minFreeLength: MIN_FREE_LENGTH,
    pitchMax: PITCH_MAX,
    c5Pitch: C5_PITCH,
    marqueeMinDrag: MARQUEE_MIN_DRAG,
    pianoNotes,
    dispatch,
    getGridPointerFromEvent,
    setSelectionBox,
    setSelectedNoteIds,
    toggleStepAction: toggleStep,
    togglePianoNoteAction: togglePianoNote,
    startPreviewNote,
    lastTouchedLengthRef,
    lastTouchedVelocityRef,
    clampFn: clamp,
    isNearlyEqualFn: isNearlyEqual,
    quantizeBySnapFn: quantizeBySnap,
    getSelectionId: getNoteSelectionId,
  });

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

  const { onNoteMouseDown } = usePianoRollNoteMouseDown({
    activeChannel,
    activePatternId,
    editMode,
    selectedNoteIdSet,
    selectedNoteIds,
    selectedNotes,
    pianoNotes,
    patternLength,
    stepWidth,
    rowHeight,
    snapStepSize,
    minNoteLength,
    minFreeLength: MIN_FREE_LENGTH,
    snapEpsilon: SNAP_EPSILON,
    pitchMin: PITCH_MIN,
    pitchMax: PITCH_MAX,
    defaultNoteVelocity: DEFAULT_NOTE_VELOCITY,
    dispatch,
    clampFn: clamp,
    isNearlyEqualFn: isNearlyEqual,
    quantizeBySnapFn: quantizeBySnap,
    getSelectionId: getNoteSelectionId,
    ensureNoteIsPiano,
    removeNote,
    deleteSelectedNotes,
    setSelectedNoteIds,
    movePianoNotesBatchAction: movePianoNotesBatch,
    movePianoNoteAction: movePianoNote,
    setPianoNoteLengthAction: setPianoNoteLength,
    toggleStepAction: toggleStep,
    togglePianoNoteAction: togglePianoNote,
    resizeSessionRef,
    dragSelectionRef,
    startPreviewNote,
    lastTouchedLengthRef,
    lastTouchedVelocityRef,
    setVelocityReadout,
    midiVelocityToPercentFn: midiVelocityToPercent,
  });

  const { onSelectChannel, onSelectScaleRoot, onSelectScaleType } =
    usePianoRollToolbarActions({
      dispatch,
      setActiveChannelAction: setActiveChannel,
      setPianoRollScaleAction: setPianoRollScale,
      scaleRoot,
      scaleType,
    });

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
        onSelectChannel={onSelectChannel}
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
        onSelectScaleRoot={onSelectScaleRoot}
        onSelectScaleType={onSelectScaleType}
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
