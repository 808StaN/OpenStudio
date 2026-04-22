// Top tab strip for sample-related sections in Sample Settings dialog.
export function SampleSettingsTabs({ activeSampleTab, setActiveSampleTab }) {
  return (
    <div className="sample-settings-tabs" role="tablist" aria-label="Sample settings tabs">
      <button
        type="button"
        role="tab"
        aria-selected={activeSampleTab === "sample"}
        className={"sample-settings-tab" + (activeSampleTab === "sample" ? " is-active" : "")}
        onClick={function () {
          setActiveSampleTab("sample");
        }}
      >
        Sample Settings
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeSampleTab === "envelope"}
        className={"sample-settings-tab" + (activeSampleTab === "envelope" ? " is-active" : "")}
        onClick={function () {
          setActiveSampleTab("envelope");
        }}
      >
        Envelope
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeSampleTab === "time-stretching"}
        className={
          "sample-settings-tab" +
          (activeSampleTab === "time-stretching" ? " is-active" : "")
        }
        onClick={function () {
          setActiveSampleTab("time-stretching");
        }}
      >
        Time stretching
      </button>
    </div>
  );
}
