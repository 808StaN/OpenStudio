// Waveform/preview card rendered at the top of Sample Settings.
// It is intentionally presentational: all behavior/state is passed from parent.
export function SampleWaveformCard({
  isPluginChannel,
  pluginName,
  pluginDescription,
  sampleRef,
  getSampleFileNameWithExtension,
  isPreviewPlaying,
  onPreviewClick,
  isDropTargetActive,
  onWaveformDragOver,
  onWaveformDragLeave,
  onWaveformDrop,
  isLoading,
  error,
  peaks,
  waveformNormalizeGain,
  lengthPct,
  fadeInWidthPct,
  fadeOutStartPct,
  fadeOutWidthPct,
}) {
  return (
    <div className="sample-waveform-card">
      <div className="sample-waveform-title-row">
        <div className="sample-waveform-title">
          {isPluginChannel
            ? pluginName || "Instrument"
            : getSampleFileNameWithExtension(sampleRef)}
        </div>
        <button
          type="button"
          className={"sample-preview-btn" + (isPreviewPlaying ? " is-playing" : "")}
          onClick={function () {
            void onPreviewClick();
          }}
          disabled={!isPluginChannel && !sampleRef}
        >
          {isPreviewPlaying ? "Stop" : "Play"}
        </button>
      </div>

      <div
        className={"sample-waveform-view" + (isDropTargetActive ? " is-drop-target" : "")}
        onDragOver={onWaveformDragOver}
        onDragLeave={onWaveformDragLeave}
        onDrop={onWaveformDrop}
      >
        {isPluginChannel ? (
          <div className="sample-waveform-empty">
            {pluginDescription || "Drag plugin onto Channel Rack"}
          </div>
        ) : isLoading ? (
          <div className="sample-waveform-empty">Loading waveform...</div>
        ) : error ? (
          <div className="sample-waveform-empty">{error}</div>
        ) : (
          <>
            {/* Static down-sampled waveform lines for quick visual feedback. */}
            <svg
              className="sample-waveform-svg"
              viewBox="0 0 180 54"
              preserveAspectRatio="none"
            >
              {peaks.map(function (peak, index) {
                const normalized = Math.max(
                  0.02,
                  Math.min(1, Number(peak || 0) * waveformNormalizeGain),
                );
                const halfHeight = normalized * 22;
                const x = index + 0.5;
                return (
                  <line key={index} x1={x} x2={x} y1={27 - halfHeight} y2={27 + halfHeight} />
                );
              })}
            </svg>

            {/* Overlay bars visualize trim/fade settings over waveform. */}
            <div className="sample-waveform-active-length" style={{ width: lengthPct + "%" }} />
            <div className="sample-waveform-trimmed" style={{ left: lengthPct + "%" }} />
            <div className="sample-waveform-fade fade-in" style={{ width: fadeInWidthPct + "%" }} />
            <div
              className="sample-waveform-fade fade-out"
              style={{
                left: fadeOutStartPct + "%",
                width: fadeOutWidthPct + "%",
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
