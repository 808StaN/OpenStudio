import { afterEach, describe, expect, it, vi } from "vitest";
import { requestAiAgentPlan, testOpenAiConnection } from "./openAiClient";

describe("openAiClient", function () {
  afterEach(function () {
    vi.restoreAllMocks();
  });

  it("parses JSON chat completion responses", async function () {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async function () {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  message: "Plan ready",
                  operations: [{ type: "create_pattern", payload: {} }],
                }),
              },
            },
          ],
        };
      },
    });

    const result = await requestAiAgentPlan({
      apiKey: "sk-test",
      model: "gpt-5.5",
      userMessage: "create pattern",
      projectSummary: { patterns: [] },
    });

    expect(result.message).toBe("Plan ready");
    expect(result.operations).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // GPT-5.5 must not send temperature (only default 1 is supported)
    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sentBody).not.toHaveProperty("temperature");
  });

  it("sends temperature for models that support it", async function () {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async function () {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({ message: "ok", operations: [] }),
              },
            },
          ],
        };
      },
    });

    await requestAiAgentPlan({
      apiKey: "sk-test",
      model: "gpt-5.4",
      userMessage: "hi",
      projectSummary: {},
    });

    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sentBody.temperature).toBe(0.35);
  });

  it("tests model access through the models endpoint", async function () {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async function () {
        return { id: "gpt-5.5" };
      },
    });

    const result = await testOpenAiConnection({
      apiKey: "sk-test",
      model: "gpt-5.5",
    });

    expect(result.model).toBe("gpt-5.5");
  });

  it("includes conversation history in the messages array", async function () {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async function () {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({ message: "ok", operations: [] }),
              },
            },
          ],
        };
      },
    });

    await requestAiAgentPlan({
      apiKey: "sk-test",
      model: "gpt-5.4",
      userMessage: "add a snare",
      projectSummary: {},
      conversationHistory: [
        { role: "user", content: "create a trap beat" },
        { role: "assistant", content: "I created a pattern with kick and hats." },
      ],
    });

    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sentBody.messages).toHaveLength(4);
    expect(sentBody.messages[0].role).toBe("system");
    expect(sentBody.messages[1]).toEqual({
      role: "user",
      content: "create a trap beat",
    });
    expect(sentBody.messages[2].role).toBe("assistant");
    expect(sentBody.messages[3].role).toBe("user");
  });

  it("works without conversation history (empty array default)", async function () {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async function () {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({ message: "ok", operations: [] }),
              },
            },
          ],
        };
      },
    });

    await requestAiAgentPlan({
      apiKey: "sk-test",
      model: "gpt-5.4",
      userMessage: "hi",
      projectSummary: {},
    });

    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sentBody.messages).toHaveLength(2);
    expect(sentBody.messages[0].role).toBe("system");
    expect(sentBody.messages[1].role).toBe("user");
  });

  it("filters out system-role messages from conversation history", async function () {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async function () {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({ message: "ok", operations: [] }),
              },
            },
          ],
        };
      },
    });

    await requestAiAgentPlan({
      apiKey: "sk-test",
      model: "gpt-5.4",
      userMessage: "hi",
      projectSummary: {},
      conversationHistory: [
        { role: "user", content: "create a beat" },
        { role: "system", content: "Applied 2 operations." },
      ],
    });

    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    // system prompt + 1 history (user only) + current user message = 3
    expect(sentBody.messages).toHaveLength(3);
    expect(sentBody.messages[1]).toEqual({
      role: "user",
      content: "create a beat",
    });
  });
});
