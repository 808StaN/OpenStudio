import { describe, it, expect } from "vitest";
import {
  applyAiOperations,
  prepareAiOperations,
  validatePreparedAiOperations,
} from "./aiAgentOperations";

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

describe("validatePreparedAiOperations", function () {
  it("marks operations with missing referenced ids as warnings", function () {
    const prepared = prepareAiOperations([
      {
        type: "set_channel_volume",
        payload: { channelId: "missing-channel", value: 0.5 },
      },
    ]).operations;

    const validated = validatePreparedAiOperations(prepared, {
      dawState: createDawState(),
      availableSamples: [],
    });

    expect(validated[0].status).toBe("warning");
    expect(validated[0].issues[0]).toContain("Channel id does not exist");
  });

  it("warns when an instrument pluginRef is unknown", function () {
    const prepared = prepareAiOperations([
      {
        type: "assign_plugin_to_channel",
        payload: { channelId: "ch-kick", pluginRef: "missing-plugin" },
      },
    ]).operations;

    const validated = validatePreparedAiOperations(prepared, {
      dawState: createDawState(),
      availableSamples: [],
    });

    expect(validated[0].status).toBe("warning");
    expect(validated[0].issues[0]).toContain("Unknown instrument pluginRef");
  });

  it("warns when a chord progression contains single-note chords", function () {
    const prepared = prepareAiOperations([
      {
        type: "add_chord_progression",
        payload: {
          chords: [{ start: 0, length: 16, pitches: [60], velocity: 95 }],
        },
      },
    ]).operations;

    const validated = validatePreparedAiOperations(prepared, {
      dawState: createDawState(),
      availableSamples: [],
    });

    expect(validated[0].status).toBe("warning");
    expect(validated[0].issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining("at least 2 pitches"),
      ]),
    );
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

    expect(dispatched).toHaveLength(3);
    expect(dispatched[0].type).toBe("daw/beginAiOperationBatch");
    expect(dispatched[1]).toMatchObject({
      type: "daw/toggleStep",
      payload: {
        patternId: "pat-1",
        channelId: "ch-kick",
        stepIndex: 0,
      },
    });
    expect(dispatched[2].type).toBe("daw/endAiOperationBatch");

    dawState.project.patterns[0].stepGrid["ch-kick"][0] = true;
    dispatched.length = 0;

    applyAiOperations(
      prepareAiOperations([
        { type: "set_step", payload: { stepIndex: 0, value: true } },
      ]).operations,
      { dispatch, getState },
    );

    expect(dispatched).toHaveLength(2);
    expect(dispatched[0].type).toBe("daw/beginAiOperationBatch");
    expect(dispatched[1].type).toBe("daw/endAiOperationBatch");
  });

  it("dispatches instrument assignment operations", function () {
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
        {
          type: "assign_plugin_to_channel",
          payload: {
            channelId: "ch-kick",
            pluginRef: "openstudio-piano",
            pluginName: "Piano",
          },
        },
      ]).operations,
      { dispatch, getState },
    );

    expect(dispatched[1]).toMatchObject({
      type: "daw/assignPluginToChannel",
      payload: {
        channelId: "ch-kick",
        pluginRef: "openstudio-piano",
        pluginName: "Piano",
      },
    });
  });

  it("normalizes AI note velocity before dispatching piano notes", function () {
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
        {
          type: "add_piano_notes",
          payload: {
            channelId: "ch-kick",
            notes: [
              { start: 0, length: 1, pitch: 60, velocity: 0.8 },
              { start: 1, length: 1, pitch: 62, velocity: 0 },
            ],
          },
        },
      ]).operations,
      { dispatch, getState },
    );

    expect(dispatched[1].type).toBe("daw/addPianoNotesBatch");
    expect(dispatched[1].payload.notes[0].velocity).toBe(102);
    expect(dispatched[1].payload.notes[1].velocity).toBe(95);
  });

  it("expands chord progressions into long stacked piano notes", function () {
    const dawState = createDawState();
    dawState.project.patterns[0].lengthSteps = 64;
    const dispatched = [];
    const dispatch = function (action) {
      dispatched.push(action);
    };
    const getState = function () {
      return { daw: dawState };
    };

    applyAiOperations(
      prepareAiOperations([
        {
          type: "add_chord_progression",
          payload: {
            channelId: "ch-kick",
            chords: [
              { start: 0, length: 16, pitches: [57, 60, 64], velocity: 0.75 },
              { start: 16, length: 16, pitches: [53, 57, 60], velocity: 95 },
            ],
          },
        },
      ]).operations,
      { dispatch, getState },
    );

    expect(dispatched[1].type).toBe("daw/addPianoNotesBatch");
    expect(dispatched[1].payload.allowOverlaps).toBe(true);
    expect(dispatched[1].payload.notes).toHaveLength(6);
    expect(dispatched[1].payload.notes.slice(0, 3)).toEqual([
      expect.objectContaining({ start: 0, length: 16, pitch: 57, velocity: 95 }),
      expect.objectContaining({ start: 0, length: 16, pitch: 60, velocity: 95 }),
      expect.objectContaining({ start: 0, length: 16, pitch: 64, velocity: 95 }),
    ]);
  });

  it("dispatches BPM changes", function () {
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
        { type: "set_bpm", payload: { bpm: 150 } },
      ]).operations,
      { dispatch, getState },
    );

    expect(dispatched[1]).toMatchObject({
      type: "daw/setBpm",
      payload: 150,
    });
  });

  it("auto-assigns pluginRef when add_channel includes one", function () {
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
        {
          type: "add_channel",
          payload: {
            name: "Piano Track",
            pluginRef: "openstudio-piano",
          },
        },
      ]).operations,
      { dispatch, getState },
    );

    const assignAction = dispatched.find(function (action) {
      return action.type === "daw/assignPluginToChannel";
    });
    expect(assignAction).toBeDefined();
    expect(assignAction.payload.pluginRef).toBe("openstudio-piano");
    expect(assignAction.payload.pluginName).toBe("Piano");
  });

  it("does not auto-assign when pluginRef is invalid", function () {
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
        {
          type: "add_channel",
          payload: {
            name: "Mystery",
            pluginRef: "nonexistent-instrument",
          },
        },
      ]).operations,
      { dispatch, getState },
    );

    const assignAction = dispatched.find(function (action) {
      return action.type === "daw/assignPluginToChannel";
    });
    expect(assignAction).toBeUndefined();
  });

  it("warns when add_piano_notes targets a channel without instrument", function () {
    const dawState = createDawState();

    const validated = validatePreparedAiOperations(
      prepareAiOperations([
        {
          type: "add_piano_notes",
          payload: {
            channelId: "ch-kick",
            notes: [{ start: 0, length: 4, pitch: 60, velocity: 95 }],
          },
        },
      ]).operations,
      { dawState },
    );

    // ch-kick has no pluginRef or sampleRef in createDawState, so the
    // validation should flag it.
    expect(validated[0].issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining("has no instrument assigned"),
      ]),
    );
    expect(validated[0].status).toBe("warning");
  });

  it("does not warn when channel has a pluginRef", function () {
    const dawState = createDawState();
    dawState.project.channels[0].pluginRef = "openstudio-piano";

    const validated = validatePreparedAiOperations(
      prepareAiOperations([
        {
          type: "add_piano_notes",
          payload: {
            channelId: "ch-kick",
            notes: [{ start: 0, length: 4, pitch: 60, velocity: 95 }],
          },
        },
      ]).operations,
      { dawState },
    );

    expect(validated[0].issues).not.toContain(
      expect.stringContaining("has no instrument assigned"),
    );
    expect(validated[0].status).toBe("ready");
  });
});
