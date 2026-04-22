import { SettingValueEditor } from "./SettingValueEditor";

// "Sample" tab section for audio clips: trim, fades, normalize and pitch.
export function SampleTabSection({ settings, onSettingChange }) {
  return (
    <>
      <div className="sample-setting-toggle-row">
        <label className="sample-setting-row cut-toggle">
          <span>Cut itself</span>
          <input
            type="checkbox"
            checked={Boolean(settings.cutItself)}
            onChange={function (event) {
              onSettingChange({ cutItself: event.target.checked });
            }}
          />
        </label>

        <label className="sample-setting-row cut-toggle">
          <span>Normalize</span>
          <input
            type="checkbox"
            checked={Boolean(settings.normalize)}
            onChange={function (event) {
              onSettingChange({ normalize: event.target.checked });
            }}
          />
        </label>
      </div>

      <label className="sample-setting-row">
        <span>Length</span>
        <input
          type="range"
          min="5"
          max="100"
          step="1"
          value={settings.lengthPct}
          onChange={function (event) {
            onSettingChange({
              lengthPct: Number(event.target.value),
            });
          }}
        />
        <SettingValueEditor
          value={settings.lengthPct}
          min={5}
          max={100}
          step={1}
          suffix="%"
          isSigned={false}
          onCommit={function (nextValue) {
            onSettingChange({ lengthPct: nextValue });
          }}
        />
      </label>

      <label className="sample-setting-row">
        <span>In</span>
        <input
          type="range"
          min="0"
          max="95"
          step="1"
          value={settings.fadeInPct}
          onChange={function (event) {
            onSettingChange({
              fadeInPct: Number(event.target.value),
            });
          }}
        />
        <SettingValueEditor
          value={settings.fadeInPct}
          min={0}
          max={95}
          step={1}
          suffix="%"
          isSigned={false}
          onCommit={function (nextValue) {
            onSettingChange({ fadeInPct: nextValue });
          }}
        />
      </label>

      <label className="sample-setting-row">
        <span>Out</span>
        <input
          type="range"
          min="0"
          max="95"
          step="1"
          value={settings.fadeOutPct}
          onChange={function (event) {
            onSettingChange({
              fadeOutPct: Number(event.target.value),
            });
          }}
        />
        <SettingValueEditor
          value={settings.fadeOutPct}
          min={0}
          max={95}
          step={1}
          suffix="%"
          isSigned={false}
          onCommit={function (nextValue) {
            onSettingChange({ fadeOutPct: nextValue });
          }}
        />
      </label>

      <label className="sample-setting-row">
        <span>Pitch</span>
        <input
          type="range"
          min="-100"
          max="100"
          step="1"
          value={settings.pitchCents}
          onChange={function (event) {
            onSettingChange({
              pitchCents: Number(event.target.value),
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
    </>
  );
}
