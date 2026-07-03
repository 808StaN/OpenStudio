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
});
