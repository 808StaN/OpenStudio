import { AI_AGENT_DEFAULT_MODEL, getAiAgentSystemPrompt } from "./aiAgentPrompt";

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODELS_URL = "https://api.openai.com/v1/models";

function parseAiJsonContent(content) {
  const raw = String(content || "").trim();
  if (!raw) {
    throw new Error("AI returned an empty response.");
  }

  try {
    return JSON.parse(raw);
  } catch {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("AI response was not valid JSON.");
    }
    return JSON.parse(jsonMatch[0]);
  }
}

export async function requestAiAgentPlan({
  apiKey,
  model = AI_AGENT_DEFAULT_MODEL,
  userMessage,
  projectSummary,
  conversationHistory = [],
}) {
  const safeApiKey = String(apiKey || "").trim();
  const safeMessage = String(userMessage || "").trim();
  const safeModel = String(model || AI_AGENT_DEFAULT_MODEL).trim() || AI_AGENT_DEFAULT_MODEL;

  if (!safeApiKey) {
    throw new Error("Paste your OpenAI API key before sending a message.");
  }

  if (!safeMessage) {
    throw new Error("Write a request for the AI Agent first.");
  }

  // GPT-5.5 (and other reasoning models) reject custom temperature values,
  // only the default (1) is supported. Older GPT-5.4 variants still accept it.
  const supportsTemperature = !safeModel.startsWith("gpt-5.5");

  // Build the full message list: system prompt, prior conversation turns,
  // then the current user request with the live project summary. This gives
  // the model context from earlier in the chat (loaded from Supabase or
  // built up during the current session).
  const historyMessages = (Array.isArray(conversationHistory)
    ? conversationHistory
    : []
  )
    .filter(function (msg) {
      return msg && (msg.role === "user" || msg.role === "assistant") && msg.content;
    })
    .map(function (msg) {
      return { role: msg.role, content: msg.content };
    });

  const requestBody = {
    model: safeModel,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: getAiAgentSystemPrompt(),
      },
      ...historyMessages,
      {
        role: "user",
        content: JSON.stringify({
          request: safeMessage,
          project: projectSummary,
        }),
      },
    ],
  };

  if (supportsTemperature) {
    requestBody.temperature = 0.35;
  }

  const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + safeApiKey,
    },
    body: JSON.stringify(requestBody),
  });

  const result = await response.json().catch(function () {
    return null;
  });

  if (!response.ok) {
    const message =
      result?.error?.message ||
      "OpenAI request failed with status " + response.status;
    throw new Error(message);
  }

  const content = result?.choices?.[0]?.message?.content;
  const parsed = parseAiJsonContent(content);

  return {
    message: String(parsed?.message || "I prepared a project edit plan."),
    operations: Array.isArray(parsed?.operations) ? parsed.operations : [],
  };
}

export async function testOpenAiConnection({
  apiKey,
  model = AI_AGENT_DEFAULT_MODEL,
}) {
  const safeApiKey = String(apiKey || "").trim();
  const safeModel = String(model || AI_AGENT_DEFAULT_MODEL).trim() || AI_AGENT_DEFAULT_MODEL;

  if (!safeApiKey) {
    throw new Error("Paste your OpenAI API key before testing the connection.");
  }

  const response = await fetch(
    OPENAI_MODELS_URL + "/" + encodeURIComponent(safeModel),
    {
      method: "GET",
      headers: {
        authorization: "Bearer " + safeApiKey,
      },
    },
  );

  const result = await response.json().catch(function () {
    return null;
  });

  if (!response.ok) {
    throw new Error(
      result?.error?.message ||
      "OpenAI connection test failed with status " + response.status,
    );
  }

  return {
    model: result?.id || safeModel,
  };
}
