import { SettingValueEditor } from "./SettingValueEditor";
import { HorizontalSlider } from "../common/HorizontalSlider";

// Plugin-channel section: basic voice controls that still apply to soundfont channels.
export function PluginSettingsSection({ settings, onSettingChange }) {
  return (
    <>
      <label className="sample-setting-row">
        <span>Attack</span>
        <HorizontalSlider
          min={0}
          max={400}
          step={1}
          value={settings.attackMs}
          onChange={function (nextValue) {
            onSettingChange({ attackMs: nextValue });
          }}
        />
        <SettingValueEditor
          value={settings.attackMs}
          min={0}
          max={400}
          step={1}
          suffix="ms"
          isSigned={false}
          onCommit={function (nextValue) {
            onSettingChange({ attackMs: nextValue });
          }}
        />
      </label>

      <label className="sample-setting-row">
        <span>Release</span>
        <HorizontalSlider
          min={0}
          max={1000}
          step={1}
          value={settings.releaseMs}
          onChange={function (nextValue) {
            onSettingChange({ releaseMs: nextValue });
          }}
        />
        <SettingValueEditor
          value={settings.releaseMs}
          min={0}
          max={1000}
          step={1}
          suffix="ms"
          isSigned={false}
          onCommit={function (nextValue) {
            onSettingChange({ releaseMs: nextValue });
          }}
        />
      </label>

      <label className="sample-setting-row">
        <span>Pitch</span>
        <HorizontalSlider
          min={-100}
          max={100}
          step={1}
          value={settings.pitchCents}
          onChange={function (nextValue) {
            onSettingChange({
              pitchCents: nextValue,
            });
          }}
        />
        <SettingValueEditor
          value={settings.pitchCents}
          min={-100}
          max={100}
          step={1}
          suffix="c"
          isSigned={true}
          onCommit={function (nextValue) {
            onSettingChange({ pitchCents: nextValue });
          }}
        />
      </label>

      <label className="sample-setting-row cut-toggle">
        <span>Mono mode</span>
        <input
          type="checkbox"
          checked={Boolean(settings.monoMode)}
          onChange={function (event) {
            onSettingChange({ monoMode: event.target.checked });
          }}
        />
      </label>
    </>
  );
}
