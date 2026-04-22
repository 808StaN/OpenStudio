// Top toolbar for Channel Rack: pattern picker, add buttons, mode switch, and length control.
// Kept stateless on purpose so parent container owns all DAW state updates.
export function ChannelRackTopBar({
  isPatternMenuOpen,
  activePatternColor,
  activePatternName,
  patterns,
  activePatternId,
  onTogglePatternMenu,
  onSelectPattern,
  onAddPattern,
  onAddChannel,
  channelRackMode,
  patternLength,
  onSetMode,
  onAdjustPatternLength,
  onPatternLengthInput,
}) {
  return (
    <header className="rack-topbar">
      <div className="rack-pattern-picker-wrap">
        <div
          className={
            "rack-pattern-picker rack-modern-select" +
            (isPatternMenuOpen ? " is-open" : "")
          }
        >
          <button
            type="button"
            className="rack-modern-select-trigger"
            aria-label="Active pattern"
            onClick={onTogglePatternMenu}
          >
            <span className="rack-modern-select-value">
              {/* Active pattern color is reused as lightweight visual cue. */}
              <span style={{ color: activePatternColor }}>
                {activePatternName || "Pattern"}
              </span>
            </span>
            <span className="rack-modern-select-caret">v</span>
          </button>

          {/* Dropdown stays in topbar component to keep all picker markup together. */}
          {isPatternMenuOpen ? (
            <div className="rack-modern-select-dropdown">
              {patterns.map(function (pattern) {
                const isActive = pattern.id === activePatternId;
                return (
                  <button
                    key={pattern.id}
                    type="button"
                    className={
                      "rack-modern-select-option" + (isActive ? " is-active" : "")
                    }
                    style={
                      isActive
                        ? null
                        : { color: String(pattern.color || activePatternColor) }
                    }
                    onClick={function () {
                      onSelectPattern(pattern.id);
                    }}
                  >
                    {pattern.name}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <button
          className="rack-pattern-add"
          title="Add pattern"
          aria-label="Add pattern"
          onClick={onAddPattern}
        >
          +
        </button>
        <button
          className="rack-channel-add"
          title="Add channel"
          aria-label="Add channel"
          onClick={onAddChannel}
        >
          + Channel
        </button>
      </div>

      <div className="rack-topbar-controls">
        <div className="rack-mode-toggle">
          <button
            className={channelRackMode === "sequencer" ? "is-active" : ""}
            onClick={function () {
              onSetMode("sequencer");
            }}
          >
            Sequencer
          </button>
          <button
            className={channelRackMode === "melody" ? "is-active" : ""}
            onClick={function () {
              onSetMode("melody");
            }}
          >
            Melody Mode
          </button>
        </div>

        {/* Pattern length control is centralized here, parent only receives numeric intents. */}
        <div className="pattern-length-control">
          <span>Pattern Length</span>
          <button
            onClick={function () {
              onAdjustPatternLength(-4);
            }}
          >
            -
          </button>
          <input
            type="number"
            min="4"
            max="128"
            step="1"
            value={patternLength}
            onChange={onPatternLengthInput}
          />
          <button
            onClick={function () {
              onAdjustPatternLength(4);
            }}
          >
            +
          </button>
          <small>steps</small>
        </div>
      </div>
    </header>
  );
}
