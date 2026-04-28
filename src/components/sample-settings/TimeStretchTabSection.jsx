import {
  STRETCH_MODE_OPTIONS,
  STRETCH_TIME_MODE_OPTIONS,
} from "./sampleSettingsConstants";
import { SettingValueEditor } from "./SettingValueEditor";
import { HorizontalSlider } from "../common/HorizontalSlider";

// "Time stretching" tab section with multiplier/pitch and custom dropdown controls.
export function TimeStretchTabSection({
  settings,
  onSettingChange,
  stretchSelectsRef,
  openStretchSelect,
  setOpenStretchSelect,
  getOptionLabel,
  bpm,
}) {
  return (
    <section className="sample-time-stretch-panel">
      <header className="sample-time-stretch-header">
        <span>Time stretching</span>
      </header>

      <div className="sample-time-stretch-knobs">
        <label className="sample-time-knob-row">
          <span>PITCH</span>
          <HorizontalSlider
            min={-24}
            max={24}
            step={0.01}
            value={Number(settings.stretchPitchSemitones || 0)}
            onChange={function (nextValue) {
              onSettingChange({
                stretchPitchSemitones: nextValue,
              });
            }}
          />
          <SettingValueEditor
            value={Number(settings.stretchPitchSemitones || 0)}
            min={-24}
            max={24}
            step={0.01}
            suffix="st"
            isSigned={true}
            onCommit={function (nextValue) {
              onSettingChange({ stretchPitchSemitones: nextValue });
            }}
          />
        </label>

        <label className="sample-time-knob-row">
          <span>MUL</span>
          <HorizontalSlider
            min={0.25}
            max={8}
            step={0.01}
            value={Number(settings.stretchMultiplier || 1)}
            onChange={function (nextValue) {
              onSettingChange({
                stretchMultiplier: nextValue,
              });
            }}
          />
          <SettingValueEditor
            value={Number(settings.stretchMultiplier || 1)}
            min={0.25}
            max={8}
            step={0.01}
            suffix="x"
            isSigned={false}
            onCommit={function (nextValue) {
              onSettingChange({ stretchMultiplier: nextValue });
            }}
          />
        </label>
      </div>

      <div className="sample-time-stretch-selects" ref={stretchSelectsRef}>
        <label className="sample-time-select-row">
          <span>TIME</span>
          <div
            className={
              "sample-time-select-control rack-modern-select" +
              (openStretchSelect === "time" ? " is-open" : "")
            }
          >
            <button
              type="button"
              className="rack-modern-select-trigger"
              aria-label="Time stretch mode"
              onClick={function () {
                setOpenStretchSelect(openStretchSelect === "time" ? null : "time");
              }}
            >
              <span className="rack-modern-select-value">
                {getOptionLabel(
                  STRETCH_TIME_MODE_OPTIONS,
                  String(settings.stretchTimeMode || "none"),
                )}
              </span>
              <span className="rack-modern-select-caret">v</span>
            </button>
            {openStretchSelect === "time" ? (
              <div className="rack-modern-select-dropdown">
                {STRETCH_TIME_MODE_OPTIONS.map(function (option) {
                  const isActive =
                    option.value === String(settings.stretchTimeMode || "none");
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={
                        "rack-modern-select-option" + (isActive ? " is-active" : "")
                      }
                      onClick={function () {
                        const nextMode = option.value;
                        const changes = {
                          stretchTimeMode: nextMode,
                        };

                        if (nextMode === "project-tempo") {
                          changes.stretchProjectTempoBpm = Number(bpm || 120);
                        }

                        onSettingChange(changes);
                        setOpenStretchSelect(null);
                      }}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </label>

        <label className="sample-time-select-row">
          <span>Mode</span>
          <div
            className={
              "sample-time-select-control rack-modern-select" +
              (openStretchSelect === "mode" ? " is-open" : "")
            }
          >
            <button
              type="button"
              className="rack-modern-select-trigger"
              aria-label="Time stretch algorithm"
              onClick={function () {
                setOpenStretchSelect(openStretchSelect === "mode" ? null : "mode");
              }}
            >
              <span className="rack-modern-select-value">
                {getOptionLabel(
                  STRETCH_MODE_OPTIONS,
                  String(settings.stretchMode || "resample"),
                )}
              </span>
              <span className="rack-modern-select-caret">v</span>
            </button>
            {openStretchSelect === "mode" ? (
              <div className="rack-modern-select-dropdown">
                {STRETCH_MODE_OPTIONS.map(function (option) {
                  const isActive =
                    option.value === String(settings.stretchMode || "resample");
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={
                        "rack-modern-select-option" + (isActive ? " is-active" : "")
                      }
                      onClick={function () {
                        onSettingChange({ stretchMode: option.value });
                        setOpenStretchSelect(null);
                      }}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </label>
      </div>

      {String(settings.stretchTimeMode || "none") === "set-bpm" ? (
        <label className="sample-setting-row">
          <span>Set BPM</span>
          <HorizontalSlider
            min={20}
            max={300}
            step={1}
            value={Number(settings.stretchSourceBpm || 120)}
            onChange={function (nextValue) {
              onSettingChange({
                stretchSourceBpm: nextValue,
              });
            }}
          />
          <SettingValueEditor
            value={Number(settings.stretchSourceBpm || 120)}
            min={20}
            max={300}
            step={1}
            suffix=" bpm"
            isSigned={false}
            onCommit={function (nextValue) {
              onSettingChange({ stretchSourceBpm: nextValue });
            }}
          />
        </label>
      ) : null}
    </section>
  );
}
