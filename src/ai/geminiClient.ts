import { getAiAgentSystemPrompt } from "./aiAgentPrompt";
import { getAiProviderConfig, AI_AGENT_PROVIDER_GEMINI } from "./aiProviders";
import type { AiAgentPlan, AiPlanRequest } from "../types/ai"

const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

interface GeminiErrorResponse {
  error?: { message?: string }
}

interface GeminiGenerateResponse extends GeminiErrorResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
}

interface ParsedAiPlan {
  message?: unknown
  operations?: unknown
}

interface GeminiContent {
  role: "user" | "model"
  parts: Array<{ text: string }>
}

function parseAiJsonContent(content: unknown): ParsedAiPlan {
  const raw = String(content || "").trim();
  if (!raw) {
    throw new Error("AI returned an empty response.");
  }

  try {
    return JSON.parse(raw) as ParsedAiPlan;
  } catch {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("AI response was not valid JSON.");
    }
    return JSON.parse(jsonMatch[0]) as ParsedAiPlan;
  }
}

function buildGeminiContents({
  userMessage,
  projectSummary,
  conversationHistory,
}: Pick<AiPlanRequest, "userMessage" | "projectSummary" | "conversationHistory">): GeminiContent[] {
  const historyContents: GeminiContent[] = (Array.isArray(conversationHistory)
    ? conversationHistory
    : []
  )
    .filter(function (msg) {
      return msg && (msg.role === "user" || msg.role === "assistant") && msg.content;
    })
    .map(function (msg) {
      return {
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: String(msg.content) }],
      };
    });

  return historyContents.concat({
    role: "user",
    parts: [
      {
        text: JSON.stringify({
          request: userMessage,
          project: projectSummary,
        }),
      },
    ],
  });
}

function makeGeminiGenerateUrl(model: string, apiKey: string): string {
  return (
    GEMINI_API_BASE_URL +
    "/" +
    encodeURIComponent(model) +
    ":generateContent?key=" +
    encodeURIComponent(apiKey)
  );
}

export async function requestGeminiAgentPlan({
  apiKey,
  model,
  userMessage,
  projectSummary,
  conversationHistory = [],
}: AiPlanRequest): Promise<AiAgentPlan> {
  const provider = getAiProviderConfig(AI_AGENT_PROVIDER_GEMINI);
  const safeApiKey = String(apiKey || "").trim();
  const safeMessage = String(userMessage || "").trim();
  const safeModel = String(model || provider.defaultModel).trim() || provider.defaultModel;

  if (!safeApiKey) {
    throw new Error("Paste your Gemini API key before sending a message.");
  }

  if (!safeMessage) {
    throw new Error("Write a request for the AI Agent first.");
  }

  const response = await fetch(makeGeminiGenerateUrl(safeModel, safeApiKey), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: getAiAgentSystemPrompt() }],
      },
      contents: buildGeminiContents({
        userMessage: safeMessage,
        projectSummary,
        conversationHistory,
      }),
      generationConfig: {
        responseMimeType: "application/json",
      },
    }),
  });

  const result = await response.json().catch(function (): GeminiGenerateResponse | null {
    return null
  }) as GeminiGenerateResponse | null

  if (!response.ok) {
    throw new Error(
      result?.error?.message ||
      "Gemini request failed with status " + response.status,
    );
  }

  const content = result?.candidates?.[0]?.content?.parts?.[0]?.text;
  const parsed = parseAiJsonContent(content);

  return {
    message: String(parsed?.message || "I prepared a project edit plan."),
    operations: Array.isArray(parsed?.operations) ? parsed.operations : [],
  };
}

export async function testGeminiConnection({
  apiKey,
  model,
}: Pick<AiPlanRequest, "apiKey" | "model">): Promise<{ model: string }> {
  const provider = getAiProviderConfig(AI_AGENT_PROVIDER_GEMINI);
  const safeApiKey = String(apiKey || "").trim();
  const safeModel = String(model || provider.defaultModel).trim() || provider.defaultModel;

  if (!safeApiKey) {
    throw new Error("Paste your Gemini API key before testing the connection.");
  }

  const response = await fetch(makeGeminiGenerateUrl(safeModel, safeApiKey), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: "Return {\"ok\":true} as JSON." }],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
      },
    }),
  });

  const result = await response.json().catch(function (): GeminiErrorResponse | null {
    return null
  }) as GeminiErrorResponse | null

  if (!response.ok) {
    throw new Error(
      result?.error?.message ||
      "Gemini connection test failed with status " + response.status,
    );
  }

  return { model: safeModel };
}
