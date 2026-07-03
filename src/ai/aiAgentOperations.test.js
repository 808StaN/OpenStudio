import { describe, it, expect } from "vitest";
import { applyAiOperations, prepareAiOperations } from "./aiAgentOperations";

function createDawState() {
  return {
    project: {
      activePatternId: "pat-1",
      activeChannelId: "ch-kick",
      patterns: [
        {
          id: "pat-1",
          name: "Pattern 1",
          lengthSteps: 16,
          stepGrid: {
            "ch-kick": Array(16).fill(false),
          },
          pianoPreview: {},
        },
      ],
      channels: [
        {
          id: "ch-kick",
          name: "Kick",
        },
      ],
      playlistTracks: [{ id: "trk-1", name: "Track 1" }],
    },
    mixer: {
      inserts: [
        {
          id: "insert-1",
          fxSlots: [
            {
              id: "slot-1",
              enabled: false,
              effectType: "none",
            },
          ],
        },
      ],
    },
  };
}

describe("prepareAiOperations", function () {
  it("keeps allowed operations and rejects unsupported ones", function () {
    const result = prepareAiOperations([
      { type: "set_step", payload: { stepIndex: 0, value: true } },
      { type: "delete_everything", payload: {} },
    ]);

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].type).toBe("set_step");
    expect(result.rejected).toHaveLength(1);
  });
});

describe("applyAiOperations", function () {
  it("dispatches a step toggle only when the desired value differs", function () {
    const dawState = createDawState();
    const dispatched = [];
    const dispatch = function (action) {
      dispatched.push(action);
    };
    const getState = function () {
      return { daw: dawState };
    };

    applyAiOperations(
      prepareAiOperations([
        { type: "set_step", payload: { stepIndex: 0, value: true } },
      ]).operations,
      { dispatch, getState },
    );

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toMatchObject({
      type: "daw/toggleStep",
      payload: {
        patternId: "pat-1",
        channelId: "ch-kick",
        stepIndex: 0,
      },
    });

    dawState.project.patterns[0].stepGrid["ch-kick"][0] = true;
    dispatched.length = 0;

    applyAiOperations(
      prepareAiOperations([
        { type: "set_step", payload: { stepIndex: 0, value: true } },
      ]).operations,
      { dispatch, getState },
    );

    expect(dispatched).toHaveLength(0);
  });
});
