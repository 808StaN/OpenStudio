import { Bot } from "lucide-react";
import { AiAgentConversationList } from "./ai-agent/AiAgentConversationList";
import { AiAgentMessages } from "./ai-agent/AiAgentMessages";
import { AiAgentPlanPanel } from "./ai-agent/AiAgentPlanPanel";
import { useAiAgentController } from "./ai-agent/useAiAgentController";

const AI_AGENT_MODEL_OPTIONS = [
  { value: "gpt-5.5", label: "GPT-5.5" },
  { value: "gpt-5.4", label: "GPT-5.4" },
  { value: "gpt-5.4-mini", label: "GPT-5.4 mini" },
];

export function AiAgentWindow() {
  const agent = useAiAgentController();

  return (
    <section className="ai-agent-shell">
      <div className="ai-agent-hero">
        <div className="ai-agent-avatar" aria-hidden="true">
          <Bot size={22} />
        </div>
        <div>
          <p className="ai-agent-kicker">Project assistant</p>
          <h2>AI Agent</h2>
        </div>
      </div>

      <div className="ai-agent-settings-card">
        <label>
          <span>OpenAI API key</span>
          <input
            type="password"
            value={agent.apiKey}
            placeholder="sk-..."
            autoComplete="off"
            onChange={function (event) {
              agent.setApiKey(event.target.value);
            }}
          />
        </label>
        <label>
          <span>Model</span>
          <select
            value={agent.model}
            onChange={function (event) {
              agent.setModel(event.target.value);
            }}
          >
            {AI_AGENT_MODEL_OPTIONS.map(function (option) {
              return (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              );
            })}
          </select>
        </label>
        <label className="ai-agent-remember-key">
          <input
            type="checkbox"
            checked={agent.rememberKey}
            onChange={function (event) {
              agent.setRememberKey(event.target.checked);
            }}
          />
          <span>Remember on this device</span>
        </label>
        <div className="ai-agent-key-actions">
          <button
            type="button"
            onClick={agent.testConnection}
            disabled={agent.isTestingConnection || !agent.apiKey.trim()}
          >
            {agent.isTestingConnection ? "Testing..." : "Test connection"}
          </button>
          <button type="button" onClick={agent.forgetKey}>
            Forget key
          </button>
        </div>
        {agent.connectionStatus ? (
          <div className="ai-agent-connection-status">
            {agent.connectionStatus}
          </div>
        ) : null}
      </div>

      <div className="ai-agent-layout">
        <AiAgentConversationList
          conversations={agent.conversations}
          activeConversationId={agent.activeConversationId}
          onSelect={agent.selectConversation}
          onNew={agent.startNewConversation}
          onDelete={agent.deleteConversation}
          isLoading={agent.isLoadingConversations}
          isAuthenticated={agent.isAuthenticated}
        />

        <div className="ai-agent-chat-card">
          <AiAgentMessages messages={agent.messages} />

          {agent.error ? <div className="ai-agent-error">{agent.error}</div> : null}

          <form className="ai-agent-composer" onSubmit={agent.sendMessage}>
            <textarea
              value={agent.input}
              placeholder="Example: create a dark trap pattern with kick, snare and hats"
              disabled={agent.isSending}
              onChange={function (event) {
                agent.setInput(event.target.value);
              }}
              onKeyDown={function (event) {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  agent.sendMessage(event);
                }
              }}
            />
            <button
              type="submit"
              disabled={agent.isSending || !agent.input.trim()}
            >
              {agent.isSending ? "Thinking..." : "Send"}
            </button>
          </form>
        </div>

        <AiAgentPlanPanel
          operations={agent.pendingOperations}
          operationResults={agent.operationResults}
          rejectedOperations={agent.rejectedOperations}
          isApplying={agent.isApplying}
          onApply={agent.applyPendingOperations}
        />
      </div>
    </section>
  );
}
