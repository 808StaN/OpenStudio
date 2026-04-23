import {
  clamp,
  getNoteSelectionId,
  getPitchClassName,
  midiVelocityToPercent,
  toPitchClass,
} from "./pianoRollUtils";

const DEFAULT_NOTE_VELOCITY = 95;
const PIANO_PITCH_MAX = 127;
const STEPS_PER_BAR = 16;

/**
 * Main note grid (bars, scale shading, notes, selection marquee and playhead).
 */
export function PianoRollNoteGrid({
  gridWrapRef,
  onGridWheel,
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
  pitchRows,
  rowHeight,
  pianoNotes,
  selectedNoteIdSet,
  onNoteMouseDown,
}) {
  return (
    <div
      className="piano-grid-wrap"
      ref={gridWrapRef}
      onWheel={onGridWheel}
      onScroll={onGridWrapScroll}
      onContextMenu={function (event) {
        event.preventDefault();
      }}
    >
      <div className="piano-grid-header" style={{ width: gridWidth }}>
        {Array.from({ length: totalBars }).map(function (_, barIndex) {
          const barStart = barIndex * STEPS_PER_BAR;
          const barSteps = Math.min(STEPS_PER_BAR, patternLength - barStart);
          return (
            <div
              key={barIndex}
              className="piano-bar-cell"
              style={{ width: barSteps * stepWidth }}
            >
              {barIndex + 1}
            </div>
          );
        })}
      </div>

      <div
        className="piano-grid"
        style={{
          width: gridWidth,
          height: gridHeight,
          "--step-width": stepWidth + "px",
          "--bar-width": stepWidth * 4 + "px",
          "--row-height": rowHeight + "px",
          "--snap-width": snapLineWidth + "px",
          "--snap-opacity": String(snapLineOpacity),
        }}
        onDragOver={onPianoRollMidiDragOver}
        onDrop={onPianoRollMidiDrop}
        onMouseDown={onGridMouseDown}
        onContextMenu={function (event) {
          event.preventDefault();
        }}
      >
        {selectionBox ? (
          <span
            className="piano-selection-box"
            style={{
              left: Math.min(selectionBox.startX, selectionBox.endX),
              top: Math.min(selectionBox.startY, selectionBox.endY),
              width: Math.abs(selectionBox.endX - selectionBox.startX),
              height: Math.abs(selectionBox.endY - selectionBox.startY),
            }}
          />
        ) : null}

        {isPlaying ? <span ref={playheadRef} className="piano-playhead-line" /> : null}

        {Array.from({ length: Math.max(0, totalBars - 1) }).map(function (_, index) {
          const boundaryStep = (index + 1) * STEPS_PER_BAR;
          if (boundaryStep >= patternLength) {
            return null;
          }

          return (
            <span
              key={"major-line-" + boundaryStep}
              className="piano-major-line"
              style={{ left: boundaryStep * stepWidth }}
            />
          );
        })}

        {pitchRows.map(function (pitch, rowIndex) {
          if (scalePitchClasses.has(toPitchClass(pitch))) {
            return null;
          }

          return (
            <span
              key={"scale-row-" + pitch}
              className="piano-scale-row"
              style={{
                top: rowIndex * rowHeight,
                height: rowHeight,
              }}
            />
          );
        })}

        {pianoNotes.map(function (note) {
          const top = (PIANO_PITCH_MAX - note.pitch) * rowHeight + 2;
          const left = note.start * stepWidth + 1;
          const width = Math.max(8, note.length * stepWidth - 2);
          const velocityAlpha = clamp(
            midiVelocityToPercent(Number(note.velocity || DEFAULT_NOTE_VELOCITY)) / 100,
            0.78,
            1,
          );

          return (
            <span
              key={note.id}
              className={
                "piano-note" +
                (note.source === "step" ? " from-step" : " from-piano") +
                (selectedNoteIdSet.has(getNoteSelectionId(note)) ? " is-selected" : "")
              }
              onMouseDown={function (event) {
                onNoteMouseDown(event, note);
              }}
              onContextMenu={function (event) {
                event.preventDefault();
              }}
              style={{
                top,
                left,
                width,
                height: Math.max(6, rowHeight - 4),
                opacity: velocityAlpha,
              }}
            >
              <span className="piano-note-label">{getPitchClassName(note.pitch)}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
