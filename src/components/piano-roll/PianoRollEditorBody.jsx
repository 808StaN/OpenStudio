import {
  clamp,
  getNoteName,
  getNoteSelectionId,
  getPitchClassName,
  midiVelocityToPercent,
  toPitchClass,
} from "./pianoRollUtils";

const DEFAULT_NOTE_VELOCITY = 95;
const PIANO_PITCH_MAX = 127;
const STEPS_PER_BAR = 16;

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
        <aside
          className="piano-keys"
          ref={keysRef}
          onWheel={onGridWheel}
          onScroll={onKeysScroll}
          style={{ height: "100%" }}
        >
          <div className="piano-keys-header" />
          {pitchRows.map(function (pitch) {
            const noteName = getNoteName(pitch);
            const isSharp = noteName.includes("#");
            const isC = noteName.startsWith("C");

            return (
              <div
                key={pitch}
                className={
                  "piano-key-row" + (isSharp ? " sharp" : "") + (isC ? " marker" : "")
                }
                style={{ height: rowHeight }}
              >
                <span>{noteName}</span>
              </div>
            );
          })}
        </aside>

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
      </div>

      <button
        type="button"
        className="piano-velocity-resize"
        onMouseDown={onVelocityResizeMouseDown}
        aria-label="Resize velocity lane"
      />

      <div className="piano-velocity-grid-shell" style={{ height: velocityLaneHeight }}>
        <aside className="piano-velocity-label">
          <strong>Control</strong>
          <span>Velocity</span>
          {isVelocityLaneHovered || isVelocityEditing ? <em>Vel {velocityReadout}%</em> : null}
        </aside>

        <div
          className="piano-velocity-wrap"
          ref={velocityWrapRef}
          onMouseEnter={function () {
            setIsVelocityLaneHovered(true);
          }}
          onMouseLeave={function () {
            if (!velocityBrushActiveRef.current) {
              setIsVelocityLaneHovered(false);
            }
          }}
          onScroll={onVelocityWrapScroll}
          onContextMenu={function (event) {
            event.preventDefault();
          }}
        >
          <div
            className="piano-velocity-grid"
            onMouseDown={function (event) {
              startVelocityBrush(event, null);
            }}
            style={{
              width: gridWidth,
              "--step-width": stepWidth + "px",
              "--bar-width": stepWidth * 4 + "px",
              "--snap-width": snapLineWidth + "px",
              "--snap-opacity": String(snapLineOpacity),
            }}
          >
            {Array.from({ length: Math.max(0, totalBars - 1) }).map(function (_, index) {
              const boundaryStep = (index + 1) * STEPS_PER_BAR;
              if (boundaryStep >= patternLength) {
                return null;
              }

              return (
                <span
                  key={"vel-major-line-" + boundaryStep}
                  className="piano-major-line"
                  style={{ left: boundaryStep * stepWidth }}
                />
              );
            })}

            {pianoNotes.map(function (note) {
              const isSelected = selectedNoteIdSet.has(getNoteSelectionId(note));
              const velocity = clamp(Number(note.velocity || DEFAULT_NOTE_VELOCITY), 1, 127);
              const ratio = midiVelocityToPercent(velocity) / 100;
              const selectedExpand = isSelected ? 2 : 0;
              const barLeft = note.start * stepWidth + 2;
              const barWidth = Math.max(3, note.length * stepWidth - 4);
              const stemHeight = Math.max(1, ratio * velocityLaneHeight);

              return (
                <span
                  key={"velocity-" + note.id}
                  className={
                    "piano-velocity-bar" +
                    (note.source === "step" ? " from-step" : " from-piano") +
                    (isSelected ? " is-selected" : "")
                  }
                  style={{
                    left: barLeft - selectedExpand,
                    width: barWidth + selectedExpand * 2,
                    height: stemHeight,
                    "--velocity-stem-height": stemHeight + "px",
                    zIndex: isSelected ? 4 : 2,
                  }}
                  onMouseDown={function (event) {
                    onVelocityBarMouseDown(event, note);
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
