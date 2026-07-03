import { AI_AGENT_DEFAULT_MODEL, getAiAgentSystemPrompt } from "./aiAgentPrompt";

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";

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

  const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + safeApiKey,
    },
    body: JSON.stringify({
      model: safeModel,
      response_format: { type: "json_object" },
      temperature: 0.35,
      messages: [
        {
          role: "system",
          content: getAiAgentSystemPrompt(),
        },
        {
          role: "user",
          content: JSON.stringify({
            request: safeMessage,
            project: projectSummary,
          }),
        },
      ],
    }),
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
