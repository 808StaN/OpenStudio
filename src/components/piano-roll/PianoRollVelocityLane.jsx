import { clamp, getNoteSelectionId, midiVelocityToPercent } from "./pianoRollUtils";

const DEFAULT_NOTE_VELOCITY = 95;
const STEPS_PER_BAR = 16;

/**
 * Velocity lane beneath the main note grid.
 */
export function PianoRollVelocityLane({
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
  gridWidth,
  stepWidth,
  snapLineWidth,
  snapLineOpacity,
  totalBars,
  patternLength,
  pianoNotes,
  selectedNoteIdSet,
  onVelocityBarMouseDown,
}) {
  return (
    <>
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
    </>
  );
}
