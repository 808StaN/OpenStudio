import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./openAiClient", function () {
  return {
    requestAiAgentPlan: vi.fn(async function () {
      return { provider: "openai" };
    }),
    testOpenAiConnection: vi.fn(async function () {
      return { model: "gpt-5.5" };
    }),
  };
});

vi.mock("./geminiClient", function () {
  return {
    requestGeminiAgentPlan: vi.fn(async function () {
      return { provider: "gemini" };
    }),
    testGeminiConnection: vi.fn(async function () {
      return { model: "gemini-3.5-flash" };
    }),
  };
});

import { requestAiAgentPlan, testAiConnection } from "./aiClient";
import {
  requestAiAgentPlan as requestOpenAiAgentPlan,
  testOpenAiConnection,
} from "./openAiClient";
import { requestGeminiAgentPlan, testGeminiConnection } from "./geminiClient";
import type { AiProjectSummary } from "../types/ai";

function createProjectSummary<T extends Record<string, unknown>>(
  summary: T,
): T & AiProjectSummary {
  return summary as T & AiProjectSummary;
}

describe("aiClient", function () {
  beforeEach(function () {
    vi.clearAllMocks();
  });

  it("routes plan requests to OpenAI by default", async function () {
    const result = await requestAiAgentPlan({
      apiKey: "sk-test",
      model: "gpt-5.5",
      userMessage: "create pattern",
      projectSummary: createProjectSummary({}),
    });

    expect((result as typeof result & { provider: string }).provider).toBe("openai");
    expect(requestOpenAiAgentPlan).toHaveBeenCalledTimes(1);
    expect(requestGeminiAgentPlan).not.toHaveBeenCalled();
  });

  it("routes plan requests to Gemini", async function () {
    const result = await requestAiAgentPlan({
      provider: "gemini",
      apiKey: "gemini-key",
      model: "gemini-3.5-flash",
      userMessage: "create pattern",
      projectSummary: createProjectSummary({}),
    });

    expect((result as typeof result & { provider: string }).provider).toBe("gemini");
    expect(requestGeminiAgentPlan).toHaveBeenCalledTimes(1);
    expect(requestOpenAiAgentPlan).not.toHaveBeenCalled();
  });

  it("routes connection tests to the selected provider", async function () {
    await testAiConnection({ provider: "openai", apiKey: "sk-test" });
    await testAiConnection({ provider: "gemini", apiKey: "gemini-key" });

    expect(testOpenAiConnection).toHaveBeenCalledTimes(1);
    expect(testGeminiConnection).toHaveBeenCalledTimes(1);
  });
});
