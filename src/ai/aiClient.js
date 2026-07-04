import {
  requestAiAgentPlan as requestOpenAiAgentPlan,
  testOpenAiConnection,
} from "./openAiClient";
import { requestGeminiAgentPlan, testGeminiConnection } from "./geminiClient";
import {
  AI_AGENT_PROVIDER_GEMINI,
  AI_AGENT_PROVIDER_OPENAI,
  getAiProviderConfig,
} from "./aiProviders";

export async function requestAiAgentPlan({ provider, ...params }) {
  const config = getAiProviderConfig(provider);
  if (config.id === AI_AGENT_PROVIDER_GEMINI) {
    return requestGeminiAgentPlan(params);
  }
  return requestOpenAiAgentPlan(params);
}

export async function testAiConnection({ provider, ...params }) {
  const config = getAiProviderConfig(provider);
  if (config.id === AI_AGENT_PROVIDER_GEMINI) {
    return testGeminiConnection(params);
  }
  if (config.id === AI_AGENT_PROVIDER_OPENAI) {
    return testOpenAiConnection(params);
  }
  return testOpenAiConnection(params);
}
