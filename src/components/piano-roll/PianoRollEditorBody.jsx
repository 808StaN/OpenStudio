import { PianoRollPitchKeys } from "./PianoRollPitchKeys";
import { PianoRollNoteGrid } from "./PianoRollNoteGrid";
import { PianoRollVelocityLane } from "./PianoRollVelocityLane";

// Main editor body: keys, note grid, playhead and velocity lane.
export function PianoRollEditorBody(props) {
  const {
    pitchRows,
    rowHeight,
    onGridWheel,
    onKeysScroll,
    keysRef,
    gridWrapRef,
    onGridWrapScroll,
    gridWidth,
    totalBars,
    patternLength,
    stepWidth,
    gridHeight,
    snapLineWidth,
    snapLineOpacity,
    onPianoRollMidiDragOver,
    onPianoRollMidiDrop,
    onGridMouseDown,
    selectionBox,
    isPlaying,
    playheadRef,
    scalePitchClasses,
    pianoNotes,
    selectedNoteIdSet,
    onNoteMouseDown,
    onVelocityResizeMouseDown,
    velocityLaneHeight,
    isVelocityLaneHovered,
    isVelocityEditing,
    velocityReadout,
    setIsVelocityLaneHovered,
    velocityBrushActiveRef,
    velocityWrapRef,
    onVelocityWrapScroll,
    startVelocityBrush,
    onVelocityBarMouseDown,
  } = props;

  return (
    <div className="piano-roll-body">
      <div className="piano-main-grid">
        <PianoRollPitchKeys
          keysRef={keysRef}
          onGridWheel={onGridWheel}
          onKeysScroll={onKeysScroll}
          pitchRows={pitchRows}
          rowHeight={rowHeight}
        />

        <PianoRollNoteGrid
          gridWrapRef={gridWrapRef}
          onGridWheel={onGridWheel}
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
          pitchRows={pitchRows}
          rowHeight={rowHeight}
          pianoNotes={pianoNotes}
          selectedNoteIdSet={selectedNoteIdSet}
          onNoteMouseDown={onNoteMouseDown}
        />
      </div>

      <PianoRollVelocityLane
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
        gridWidth={gridWidth}
        stepWidth={stepWidth}
        snapLineWidth={snapLineWidth}
        snapLineOpacity={snapLineOpacity}
        totalBars={totalBars}
        patternLength={patternLength}
        pianoNotes={pianoNotes}
        selectedNoteIdSet={selectedNoteIdSet}
        onVelocityBarMouseDown={onVelocityBarMouseDown}
      />
    </div>
  );
}
