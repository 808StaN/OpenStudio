import { MessageSquarePlus, Trash2 } from "lucide-react";

/**
 * @fileoverview AiAgentConversationList — Sidebar showing saved AI chat
 * conversations for authenticated users. Unauthenticated users see a
 * sign-in prompt instead of the list.
 */

function formatRelativeTime(isoString) {
  if (!isoString) {
    return "";
  }

  const now = Date.now();
  const then = new Date(isoString).getTime();
  if (Number.isNaN(then)) {
    return "";
  }

  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) {
    return "just now";
  }
  if (diffMin < 60) {
    return diffMin + "m ago";
  }
  if (diffHr < 24) {
    return diffHr + "h ago";
  }
  if (diffDay < 7) {
    return diffDay + "d ago";
  }
  return new Date(then).toLocaleDateString();
}

export function AiAgentConversationList({
  conversations,
  activeConversationId,
  onSelect,
  onNew,
  onDelete,
  isLoading,
  isAuthenticated,
}) {
  if (!isAuthenticated) {
    return (
      <aside className="ai-agent-conversation-list">
        <div className="ai-agent-conversation-empty">
          <span>Sign in to save chat history across sessions and devices.</span>
        </div>
      </aside>
    );
  }

  return (
    <aside className="ai-agent-conversation-list">
      <button
        type="button"
        className="ai-agent-conversation-new"
        onClick={onNew}
      >
        <MessageSquarePlus size={14} />
        New chat
      </button>

      {isLoading && conversations.length === 0 ? (
        <div className="ai-agent-conversation-loading">Loading...</div>
      ) : conversations.length === 0 ? (
        <div className="ai-agent-conversation-loading">
          No conversations yet.
        </div>
      ) : (
        <ul className="ai-agent-conversation-items">
          {conversations.map(function (item) {
            const isActive = item.id === activeConversationId;
            return (
              <li
                key={item.id}
                className={
                  "ai-agent-conversation-item" +
                  (isActive ? " is-active" : "")
                }
              >
                <button
                  type="button"
                  className="ai-agent-conversation-select"
                  onClick={function () {
                    onSelect(item.id);
                  }}
                >
                  <span className="ai-agent-conversation-title">
                    {item.title}
                  </span>
                  <span className="ai-agent-conversation-time">
                    {formatRelativeTime(item.updated_at)}
                  </span>
                </button>
                <button
                  type="button"
                  className="ai-agent-conversation-delete"
                  title="Delete conversation"
                  onClick={function () {
                    onDelete(item.id);
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
