// Dedicated UI renderer for the Maximizer effect branch.
export function MaximizerEditor({
  activeInsert,
  maximizerParams,
  maximizerWaveformPath,
  maximizerTransferPath,
  maximizerThresholdWavePath,
  maximizerOutDb,
  setMaximizerValue,
}) {
  // Convert parameter domain to percentages used by overlay markers.
  const thresholdPosition =
    Math.max(0, Math.min(98.05, ((maximizerParams.thresholdDb + 24) / 24) * 100));
  const ceilingPosition = Math.max(
    0,
    Math.min(98.05, ((maximizerParams.ceilingDb + 18) / 18) * 100),
  );
  const characterDisplay = (Number(maximizerParams.character || 0) * 10)
    .toFixed(2)
    .replace(".", ",");
  const reductionDb = Math.max(0, Number(activeInsert?.maximizerReduction || 0));
  const stereoMeter = activeInsert?.maximizerStereoMeter || {};

  const toVolumeHeight = function (db) {
    const safeDb = Math.max(-96, Math.min(0, Number(db ?? -96)));
    return ((safeDb + 96) / 96) * 100;
  };
  const toReductionHeight = function (db) {
    const safeDb = Math.max(0, Math.min(24, Number(db ?? 0)));
    const normalized = Math.max(0, Math.min(1, safeDb / 12));
    const shaped = Math.pow(normalized, 0.75);
    return shaped * 100;
  };

  const leftVolumeHeight = toVolumeHeight(stereoMeter.leftVolumeDb);
  const rightVolumeHeight = toVolumeHeight(stereoMeter.rightVolumeDb);
  const leftReductionRaw = Number(stereoMeter.leftReductionDb ?? reductionDb);
  const rightReductionRaw = Number(stereoMeter.rightReductionDb ?? reductionDb);
  const leftReductionHeight = toReductionHeight(
    Math.max(leftReductionRaw, reductionDb * 0.9),
  );
  const rightReductionHeight = toReductionHeight(
    Math.max(rightReductionRaw, reductionDb * 0.9),
  );

  const toDbLabel = function (value) {
    const rounded = Number(value || 0).toFixed(1);
    return (Number(rounded) > 0 ? "+" : "") + rounded + " dB";
  };

  return (
    <section className="fx-plugin-panel fx-window-panel">
      <div className="fx-maximizer-shell">
        <div className="fx-maximizer-graph-wrap">
          {/* Waveform + transfer graph gives fast visual feedback while tweaking limiter. */}
          <div className="fx-maximizer-graph-header">
            <span>Limiter Trace</span>
            <span>
              Reduction: {reductionDb.toFixed(1)} dB | Out: {toDbLabel(maximizerOutDb)}
            </span>
          </div>
          <svg
            className="fx-maximizer-graph"
            viewBox="0 0 520 152"
            preserveAspectRatio="none"
            aria-label="Maximizer waveform and limiting graph"
          >
            <line x1="0" y1="76" x2="520" y2="76" className="fx-max-center" />
            {maximizerWaveformPath ? (
              <path d={maximizerWaveformPath} className="fx-max-wave-input" />
            ) : null}
            {maximizerThresholdWavePath ? (
              <path d={maximizerThresholdWavePath} className="fx-max-wave-reduction" />
            ) : null}
            <path d={maximizerTransferPath} className="fx-max-transfer-line" />
          </svg>
        </div>

        <div className="fx-maximizer-controls">
          <section className="fx-max-limiter-panel">
            <label className="fx-max-true-peak">
              <input
                type="checkbox"
                checked={maximizerParams.truePeakEnabled}
                onChange={function (event) {
                  setMaximizerValue("truePeakEnabled", event.target.checked);
                }}
              />
              <span>True Peak</span>
            </label>

            <div className="fx-max-limiter-meter">
              <div className="fx-max-limiter-combined">
                {/* Combined stereo meter: volume on outer bars, reduction on inner bars. */}
                <div className="fx-max-combined-cell" title="Left Volume">
                  <div
                    className="fx-max-combined-fill is-volume"
                    style={{ height: leftVolumeHeight + "%" }}
                  />
                </div>
                <div className="fx-max-combined-cell" title="Left Reduction">
                  <div
                    className="fx-max-combined-fill is-reduction"
                    style={{ height: leftReductionHeight + "%" }}
                  />
                </div>
                <div className="fx-max-combined-cell" title="Right Reduction">
                  <div
                    className="fx-max-combined-fill is-reduction"
                    style={{ height: rightReductionHeight + "%" }}
                  />
                </div>
                <div className="fx-max-combined-cell" title="Right Volume">
                  <div
                    className="fx-max-combined-fill is-volume"
                    style={{ height: rightVolumeHeight + "%" }}
                  />
                </div>
                <div className="fx-max-threshold-line" style={{ bottom: thresholdPosition + "%" }} />
                <div className="fx-max-ceiling-line" style={{ bottom: ceilingPosition + "%" }} />
              </div>
              <div className="fx-max-limiter-sliders">
                <input
                  type="range"
                  min="-24"
                  max="0"
                  step="0.1"
                  value={maximizerParams.thresholdDb}
                  onChange={function (event) {
                    setMaximizerValue("thresholdDb", Number(event.target.value));
                  }}
                  className="fx-max-vertical"
                  title="Threshold"
                />
                <input
                  type="range"
                  min="-18"
                  max="0"
                  step="0.1"
                  value={maximizerParams.ceilingDb}
                  onChange={function (event) {
                    setMaximizerValue("ceilingDb", Number(event.target.value));
                  }}
                  className="fx-max-vertical"
                  title="Ceiling"
                />
              </div>
            </div>

            <div className="fx-max-limiter-readouts">
              <span>Threshold {maximizerParams.thresholdDb.toFixed(1)} dB</span>
              <span>Ceiling {maximizerParams.ceilingDb.toFixed(1)} dB</span>
            </div>
          </section>

          <section className="fx-max-character-panel">
            <h4>Character</h4>
            <div className="fx-max-character-slider">
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={maximizerParams.character}
                onChange={function (event) {
                  setMaximizerValue("character", Number(event.target.value));
                }}
                className="fx-max-character-vertical"
              />
            </div>
            <div className="fx-max-character-scale">
              <strong>{characterDisplay}</strong>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
