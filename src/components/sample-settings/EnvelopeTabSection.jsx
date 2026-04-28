import { SettingValueEditor } from "./SettingValueEditor";
import { buildEnvelopePath } from "./sampleSettingsUtils";
import { HorizontalSlider } from "../common/HorizontalSlider";

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
        <HorizontalSlider
          min={0}
          max={3000}
          step={1}
          value={settings.envDelayMs}
          onChange={function (nextValue) {
            onSettingChange({
              envDelayMs: nextValue,
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
        <HorizontalSlider
          min={0}
          max={3000}
          step={1}
          value={settings.envAttackMs}
          onChange={function (nextValue) {
            onSettingChange({
              envAttackMs: nextValue,
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
        <HorizontalSlider
          min={0}
          max={3000}
          step={1}
          value={settings.envHoldMs}
          onChange={function (nextValue) {
            onSettingChange({
              envHoldMs: nextValue,
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
        <HorizontalSlider
          min={0}
          max={3000}
          step={1}
          value={settings.envDecayMs}
          onChange={function (nextValue) {
            onSettingChange({
              envDecayMs: nextValue,
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
        <HorizontalSlider
          min={0}
          max={100}
          step={1}
          value={settings.envSustainPct}
          onChange={function (nextValue) {
            onSettingChange({
              envSustainPct: nextValue,
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
        <HorizontalSlider
          min={0}
          max={3000}
          step={1}
          value={settings.envReleaseMs}
          onChange={function (nextValue) {
            onSettingChange({
              envReleaseMs: nextValue,
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
