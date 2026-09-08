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
import type { AiAgentPlan, AiPlanRequest, AiProviderId } from "../types/ai"

export async function requestAiAgentPlan({
  provider,
  ...params
}: AiPlanRequest & { provider?: AiProviderId }): Promise<AiAgentPlan> {
  const config = getAiProviderConfig(provider);
  if (config.id === AI_AGENT_PROVIDER_GEMINI) {
    return requestGeminiAgentPlan(params);
  }
  return requestOpenAiAgentPlan(params);
}

export async function testAiConnection({
  provider,
  ...params
}: Pick<AiPlanRequest, "apiKey" | "model"> & { provider?: AiProviderId }): Promise<{ model: string }> {
  const config = getAiProviderConfig(provider);
  if (config.id === AI_AGENT_PROVIDER_GEMINI) {
    return testGeminiConnection(params);
  }
  if (config.id === AI_AGENT_PROVIDER_OPENAI) {
    return testOpenAiConnection(params);
  }
  return testOpenAiConnection(params);
}
