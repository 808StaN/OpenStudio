import { Bot } from "lucide-react";
import { AiAgentMessages } from "./ai-agent/AiAgentMessages";
import { AiAgentPlanPanel } from "./ai-agent/AiAgentPlanPanel";
import { useAiAgentController } from "./ai-agent/useAiAgentController";

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
          <p>
            Paste your own OpenAI API key, describe the change, then review the
            safe action plan before applying it to the project.
          </p>
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
          <input
            type="text"
            value={agent.model}
            onChange={function (event) {
              agent.setModel(event.target.value);
            }}
          />
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
      </div>

      <div className="ai-agent-layout">
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
          rejectedOperations={agent.rejectedOperations}
          isApplying={agent.isApplying}
          onApply={agent.applyPendingOperations}
        />
      </div>
    </section>
  );
}
