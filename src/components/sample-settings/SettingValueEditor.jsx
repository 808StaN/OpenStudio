import { useState } from "react";
import {
  clampSettingValue,
  formatSettingValue,
} from "./sampleSettingsUtils";

// Small reusable inline editor used by numeric setting rows in Sample Settings.
export function SettingValueEditor({
  value,
  min,
  max,
  step,
  suffix,
  isSigned,
  onCommit,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(String(Math.round(Number(value) || 0)));

  const commitDraft = function () {
    const parsed = Number(draft);
    const next = clampSettingValue(parsed, min, max, step);
    onCommit(next);
    setIsEditing(false);
  };

  if (isEditing) {
    const visibleChars = Math.max(1, String(draft || "").length);

    return (
      <input
        type="number"
        className="sample-setting-inline-input"
        style={{ "--digits": visibleChars }}
        min={min}
        max={max}
        step={step}
        value={draft}
        autoFocus
        onChange={function (event) {
          setDraft(event.target.value);
        }}
        onBlur={commitDraft}
        onKeyDown={function (event) {
          if (event.key === "Enter") {
            commitDraft();
            return;
          }

          if (event.key === "Escape") {
            setDraft(String(Math.round(Number(value) || 0)));
            setIsEditing(false);
          }
        }}
      />
    );
  }

  return (
    <strong
      className="sample-setting-value"
      title="Double click to type value"
      onDoubleClick={function () {
        setDraft(String(Math.round(Number(value) || 0)));
        setIsEditing(true);
      }}
    >
      {formatSettingValue(value, suffix, isSigned)}
    </strong>
  );
}
