import { SettingValueEditor } from "./SettingValueEditor";
import { buildEnvelopePath } from "./sampleSettingsUtils";

// "Envelope" tab section for ADSHR envelope editing and visual preview.
export function EnvelopeTabSection({ settings, onSettingChange }) {
  return (
    <>
      <section className="sample-envelope-panel">
        <header className="sample-envelope-header">
          <span>Volume Envelope</span>
          <label className="sample-envelope-enable">
            <input
              type="checkbox"
              checked={Boolean(settings.envEnabled)}
              onChange={function (event) {
                onSettingChange({ envEnabled: event.target.checked });
              }}
            />
          </label>
        </header>
        <div className="sample-envelope-graph">
          <svg viewBox="0 0 276 92" preserveAspectRatio="none">
            <path d={buildEnvelopePath(settings)} />
          </svg>
        </div>
      </section>

      <label className="sample-setting-row">
        <span>Delay</span>
        <input
          type="range"
          min="0"
          max="3000"
          step="1"
          value={settings.envDelayMs}
          onChange={function (event) {
            onSettingChange({
              envDelayMs: Number(event.target.value),
            });
          }}
        />
        <SettingValueEditor
          value={settings.envDelayMs}
          min={0}
          max={3000}
          step={1}
          suffix="ms"
          isSigned={false}
          onCommit={function (nextValue) {
            onSettingChange({ envDelayMs: nextValue });
          }}
        />
      </label>

      <label className="sample-setting-row">
        <span>Attack</span>
        <input
          type="range"
          min="0"
          max="3000"
          step="1"
          value={settings.envAttackMs}
          onChange={function (event) {
            onSettingChange({
              envAttackMs: Number(event.target.value),
            });
          }}
        />
        <SettingValueEditor
          value={settings.envAttackMs}
          min={0}
          max={3000}
          step={1}
          suffix="ms"
          isSigned={false}
          onCommit={function (nextValue) {
            onSettingChange({ envAttackMs: nextValue });
          }}
        />
      </label>

      <label className="sample-setting-row">
        <span>Hold</span>
        <input
          type="range"
          min="0"
          max="3000"
          step="1"
          value={settings.envHoldMs}
          onChange={function (event) {
            onSettingChange({
              envHoldMs: Number(event.target.value),
            });
          }}
        />
        <SettingValueEditor
          value={settings.envHoldMs}
          min={0}
          max={3000}
          step={1}
          suffix="ms"
          isSigned={false}
          onCommit={function (nextValue) {
            onSettingChange({ envHoldMs: nextValue });
          }}
        />
      </label>

      <label className="sample-setting-row">
        <span>Decay</span>
        <input
          type="range"
          min="0"
          max="3000"
          step="1"
          value={settings.envDecayMs}
          onChange={function (event) {
            onSettingChange({
              envDecayMs: Number(event.target.value),
            });
          }}
        />
        <SettingValueEditor
          value={settings.envDecayMs}
          min={0}
          max={3000}
          step={1}
          suffix="ms"
          isSigned={false}
          onCommit={function (nextValue) {
            onSettingChange({ envDecayMs: nextValue });
          }}
        />
      </label>

      <label className="sample-setting-row">
        <span>Sustain</span>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={settings.envSustainPct}
          onChange={function (event) {
            onSettingChange({
              envSustainPct: Number(event.target.value),
            });
          }}
        />
        <SettingValueEditor
          value={settings.envSustainPct}
          min={0}
          max={100}
          step={1}
          suffix="%"
          isSigned={false}
          onCommit={function (nextValue) {
            onSettingChange({ envSustainPct: nextValue });
          }}
        />
      </label>

      <label className="sample-setting-row">
        <span>Release</span>
        <input
          type="range"
          min="0"
          max="3000"
          step="1"
          value={settings.envReleaseMs}
          onChange={function (event) {
            onSettingChange({
              envReleaseMs: Number(event.target.value),
            });
          }}
        />
        <SettingValueEditor
          value={settings.envReleaseMs}
          min={0}
          max={3000}
          step={1}
          suffix="ms"
          isSigned={false}
          onCommit={function (nextValue) {
            onSettingChange({ envReleaseMs: nextValue });
          }}
        />
      </label>
    </>
  );
}
