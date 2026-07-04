import { describe, it, expect, afterEach } from "vitest";
import {
  addChannel,
  beginAiOperationBatch,
  endAiOperationBatch,
  resetToDefaultProject,
  store,
  undoLastChange,
} from "../store";

describe("AI operation undo batching", function () {
  afterEach(function () {
    store.dispatch(resetToDefaultProject());
  });

  it("undoes a batched AI plan as one history entry", function () {
    store.dispatch(resetToDefaultProject());
    const initialCount = store.getState().daw.project.channels.length;

    store.dispatch(beginAiOperationBatch());
    store.dispatch(addChannel());
    store.dispatch(addChannel());
    store.dispatch(endAiOperationBatch());

    expect(store.getState().daw.project.channels.length).toBe(initialCount + 2);

    store.dispatch(undoLastChange());

    expect(store.getState().daw.project.channels.length).toBe(initialCount);
  });
});
