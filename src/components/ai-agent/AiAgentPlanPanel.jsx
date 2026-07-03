import { CheckCircle2 } from "lucide-react";

export function AiAgentPlanPanel({
  operations,
  operationResults,
  rejectedOperations,
  isApplying,
  onApply,
}) {
  const hasOperations = Array.isArray(operations) && operations.length > 0;
  const hasResults = Array.isArray(operationResults) && operationResults.length > 0;
  const hasRejected =
    Array.isArray(rejectedOperations) && rejectedOperations.length > 0;

  return (
    <aside className="ai-agent-plan-card">
      <div className="ai-agent-plan-header">
        <CheckCircle2 size={16} />
        <span>Preview + Apply</span>
      </div>

      {hasOperations ? (
        <ol className="ai-agent-operation-list">
          {operations.map(function (operation) {
            return (
              <li key={operation.id} className={operation.status === "warning" ? "has-warning" : ""}>
                <span>{operation.description}</span>
                {Array.isArray(operation.issues) && operation.issues.length > 0 ? (
                  <small>{operation.issues.join(" ")}</small>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : hasResults ? (
        <ol className="ai-agent-operation-list">
          {operationResults.map(function (result) {
            return (
              <li key={result.id || result.description} className={"is-" + result.status}>
                <span>{result.description}</span>
                {result.reason ? <small>{result.reason}</small> : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <p>
          The agent will never mutate the DAW state directly. It prepares a
          validated operation list first, then you decide whether to apply it.
        </p>
      )}

      {hasRejected ? (
        <div className="ai-agent-rejected-list">
          <strong>Ignored unsafe operations</strong>
          {rejectedOperations.map(function (item) {
            return <span key={item.index}>{item.reason}</span>;
          })}
        </div>
      ) : null}

      <button
        type="button"
        className="ai-agent-apply-btn"
        disabled={!hasOperations || isApplying}
        onClick={onApply}
      >
        {isApplying ? "Applying..." : "Apply Plan"}
      </button>
    </aside>
  );
}
