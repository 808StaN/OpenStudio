import { describe, it, expect } from "vitest";
import {
  buildClipboardPastePayload,
  copySelectedNotesToClipboard,
} from "./pianoRollClipboard";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function makeId(prefix) {
  makeId.count = (makeId.count || 0) + 1;
  return prefix + "-" + makeId.count;
}

describe("pianoRollClipboard", () => {
  it("keeps overlapping copied notes in paste payload", () => {
    copySelectedNotesToClipboard({
      activePatternId: "pat-1",
      activeChannelId: "ch-1",
      defaultVelocity: 95,
      clampFn: clamp,
      selectedNotes: [
        { start: 0, pitch: 60, length: 4, velocity: 100 },
        { start: 0, pitch: 60, length: 1, velocity: 80 },
      ],
    });

    const { notesToAdd, nextSelection } = buildClipboardPastePayload({
      activePatternId: "pat-1",
      activeChannelId: "ch-1",
      patternLength: 16,
      minFreeLength: 0.0625,
      pitchMin: 0,
      pitchMax: 127,
      defaultVelocity: 95,
      clampFn: clamp,
      makeIdFn: makeId,
    });

    expect(notesToAdd).toHaveLength(2);
    expect(notesToAdd[0]).toMatchObject({ start: 1, pitch: 60, length: 4 });
    expect(notesToAdd[1]).toMatchObject({ start: 1, pitch: 60, length: 1 });
    expect(nextSelection).toHaveLength(2);
  });
});
