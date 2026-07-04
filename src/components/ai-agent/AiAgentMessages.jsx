import { useEffect, useRef } from "react";
import { Sparkles } from "lucide-react";

export function AiAgentMessages({ messages }) {
  const scrollRef = useRef(null);

  useEffect(
    function () {
      const el = scrollRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    },
    [messages],
  );

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
    <div className="ai-agent-messages" ref={scrollRef}>
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
