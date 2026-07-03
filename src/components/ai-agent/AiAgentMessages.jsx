import { Sparkles } from "lucide-react";

export function AiAgentMessages({ messages }) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return (
      <div className="ai-agent-empty-state">
        <Sparkles size={20} />
        <strong>Ready for project-aware editing</strong>
        <span>
          Paste your own OpenAI API key, describe the change, then review the
          generated operation plan before applying it.
        </span>
      </div>
    );
  }

  return (
    <div className="ai-agent-messages">
      {messages.map(function (message, index) {
        return (
          <div
            key={message.role + "-" + index}
            className={"ai-agent-message is-" + message.role}
          >
            <span>{message.role}</span>
            <p>{message.content}</p>
          </div>
        );
      })}
    </div>
  );
}
