export const AI_AGENT_PROVIDER_OPENAI = "openai";
export const AI_AGENT_PROVIDER_GEMINI = "gemini";
export const AI_AGENT_DEFAULT_PROVIDER = AI_AGENT_PROVIDER_OPENAI;

export const AI_AGENT_PROVIDERS = [
  {
    id: AI_AGENT_PROVIDER_OPENAI,
    label: "OpenAI",
    defaultModel: "gpt-5.5",
    keyStorage: "openstudio.ai.keys.openai",
    modelStorage: "openstudio.ai.models.openai",
    keyPlaceholder: "sk-...",
    models: [
      { value: "gpt-5.5", label: "GPT-5.5" },
      { value: "gpt-5.4", label: "GPT-5.4" },
      { value: "gpt-5.4-mini", label: "GPT-5.4 mini" },
    ],
  },
  {
    id: AI_AGENT_PROVIDER_GEMINI,
    label: "Gemini",
    defaultModel: "gemini-3.5-flash",
    keyStorage: "openstudio.ai.keys.gemini",
    modelStorage: "openstudio.ai.models.gemini",
    keyPlaceholder: "AIza...",
    models: [
      { value: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
      { value: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite" },
      { value: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview" },
      { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview" },
    ],
  },
];

export function getAiProviderConfig(providerId) {
  const safeProviderId = String(providerId || "").trim();
  return AI_AGENT_PROVIDERS.find(function (provider) {
    return provider.id === safeProviderId;
  }) || AI_AGENT_PROVIDERS[0];
}

export function getAiProviderModel(providerId, model) {
  const provider = getAiProviderConfig(providerId);
  const safeModel = String(model || "").trim();
  const hasModel = provider.models.some(function (item) {
    return item.value === safeModel;
  });
  return hasModel ? safeModel : provider.defaultModel;
}
