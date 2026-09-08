import { afterEach, describe, expect, it, vi } from "vitest";
import { requestGeminiAgentPlan, testGeminiConnection } from "./geminiClient";
import type { AiProjectSummary } from "../types/ai";

interface GeminiRequestBody {
  systemInstruction: { parts: Array<{ text: string }> }
  generationConfig: { responseMimeType: string }
  contents: Array<{ role: string; parts: Array<{ text: string }> }>
}

function createJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

function createProjectSummary<T extends Record<string, unknown>>(
  summary: T,
): T & AiProjectSummary {
  return summary as T & AiProjectSummary;
}

function getSentBody(call: Parameters<typeof fetch> | undefined): GeminiRequestBody {
  const body = call?.[1]?.body;
  if (typeof body !== "string") {
    throw new Error("Expected a JSON request body.");
  }
  return JSON.parse(body) as GeminiRequestBody;
}

describe("geminiClient", function () {
  afterEach(function () {
    vi.restoreAllMocks();
  });

  it("parses JSON generateContent responses", async function () {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createJsonResponse({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    message: "Plan ready",
                    operations: [{ type: "create_pattern", payload: {} }],
                  }),
                },
              ],
            },
          },
        ],
      }),
    );

    const result = await requestGeminiAgentPlan({
      apiKey: "gemini-key",
      model: "gemini-3.5-flash",
      userMessage: "create pattern",
      projectSummary: createProjectSummary({ patterns: [] }),
    });

    expect(result.message).toBe("Plan ready");
    expect(result.operations).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      "/gemini-3.5-flash:generateContent?key=gemini-key",
    );

    const sentBody = getSentBody(fetchMock.mock.calls[0]);
    expect(sentBody.systemInstruction.parts[0]?.text).toContain("OpenStudio");
    expect(sentBody.generationConfig.responseMimeType).toBe("application/json");
  });

  it("maps conversation history to Gemini roles", async function () {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createJsonResponse({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify({ message: "ok", operations: [] }) }],
            },
          },
        ],
      }),
    );

    await requestGeminiAgentPlan({
      apiKey: "gemini-key",
      model: "gemini-3.1-pro-preview",
      userMessage: "add a snare",
      projectSummary: createProjectSummary({ tempo: 140 }),
      conversationHistory: [
        { role: "user", content: "create a beat" },
        { role: "assistant", content: "I created kick and hats." },
        { role: "system", content: "Applied 2 operations." },
      ],
    });

    const sentBody = getSentBody(fetchMock.mock.calls[0]);
    expect(sentBody.contents).toHaveLength(3);
    expect(sentBody.contents[0]).toEqual({
      role: "user",
      parts: [{ text: "create a beat" }],
    });
    expect(sentBody.contents[1]).toEqual({
      role: "model",
      parts: [{ text: "I created kick and hats." }],
    });
    expect(sentBody.contents[2]?.role).toBe("user");
    expect(JSON.parse(sentBody.contents[2]?.parts[0]?.text || "")).toEqual({
      request: "add a snare",
      project: { tempo: 140 },
    });
  });

  it("tests access with a lightweight JSON request", async function () {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createJsonResponse({ candidates: [] }),
    );

    const result = await testGeminiConnection({
      apiKey: "gemini-key",
      model: "gemini-3.1-flash-lite",
    });

    expect(result.model).toBe("gemini-3.1-flash-lite");
    const sentBody = getSentBody(fetchMock.mock.calls[0]);
    expect(sentBody.contents[0]?.parts[0]?.text).toBe(
      "Return {\"ok\":true} as JSON.",
    );
  });

  it("requires a Gemini API key", async function () {
    await expect(
      requestGeminiAgentPlan({
        apiKey: "",
        model: "gemini-3.5-flash",
        userMessage: "hi",
        projectSummary: createProjectSummary({}),
      }),
    ).rejects.toThrow("Paste your Gemini API key");
  });
});
