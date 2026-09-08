import { useEffect, useRef } from "react";
import { Sparkles } from "lucide-react";
import type { AiChatMessage } from "../../types/ai"

interface AiAgentMessagesProps {
  messages: AiChatMessage[]
}

export function AiAgentMessages({ messages }: AiAgentMessagesProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(
    function () {
      const el = scrollRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    },
    [messages],
  );

  if (messages.length === 0) {
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
