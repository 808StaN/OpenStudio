import { getNoteName } from "./pianoRollUtils";

/**
 * Left piano keyboard column rendered alongside the note grid.
 */
export function PianoRollPitchKeys({
  keysRef,
  onGridWheel,
  onKeysScroll,
  pitchRows,
  rowHeight,
}) {
  return (
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
  );
}
