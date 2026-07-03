import { Bot, CheckCircle2, Sparkles } from "lucide-react";

export function AiAgentWindow() {
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
            Describe the change you want. The agent will prepare a safe action
            plan that you can review before applying it to the project.
          </p>
        </div>
      </div>

      <div className="ai-agent-layout">
        <div className="ai-agent-chat-card">
          <div className="ai-agent-empty-state">
            <Sparkles size={20} />
            <strong>Ready for project-aware editing</strong>
            <span>
              Chat and tool execution will be wired to the Supabase AI provider
              in the next implementation step.
            </span>
          </div>

          <form className="ai-agent-composer">
            <textarea
              placeholder="Example: create a dark trap pattern with kick, snare and hats"
              disabled
            />
            <button type="button" disabled>
              Send
            </button>
          </form>
        </div>

        <aside className="ai-agent-plan-card">
          <div className="ai-agent-plan-header">
            <CheckCircle2 size={16} />
            <span>Preview + Apply</span>
          </div>
          <p>
            The agent will never mutate the DAW state directly. It will return a
            list of validated operations, then this panel will let you apply
            them explicitly.
          </p>
        </aside>
      </div>
    </section>
  );
}
