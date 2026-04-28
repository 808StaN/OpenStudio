import { SettingValueEditor } from "./SettingValueEditor";
import { HorizontalSlider } from "../common/HorizontalSlider";

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
        <HorizontalSlider
          min={5}
          max={100}
          step={1}
          value={settings.lengthPct}
          onChange={function (nextValue) {
            onSettingChange({
              lengthPct: nextValue,
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
        <HorizontalSlider
          min={0}
          max={95}
          step={1}
          value={settings.fadeInPct}
          onChange={function (nextValue) {
            onSettingChange({
              fadeInPct: nextValue,
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
        <HorizontalSlider
          min={0}
          max={95}
          step={1}
          value={settings.fadeOutPct}
          onChange={function (nextValue) {
            onSettingChange({
              fadeOutPct: nextValue,
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
    </>
  );
}
