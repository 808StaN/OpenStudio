import { useDispatch, useSelector } from "react-redux";
import { createPattern, renamePattern, setActivePattern } from "../store";

export function PatternListWindow() {
  const dispatch = useDispatch();

  const activePatternId = useSelector(function (state) {
    return state.daw.project.activePatternId;
  });
  const patterns = useSelector(function (state) {
    return state.daw.project.patterns;
  });
  const clips = useSelector(function (state) {
    return state.daw.project.playlistClips;
  });

  const clipCountByPattern = clips.reduce(function (acc, clip) {
    acc[clip.patternId] = (acc[clip.patternId] || 0) + 1;
    return acc;
  }, {});

  return (
    <section className="pattern-list-shell">
      <header className="pattern-list-header">
        <strong>Project Patterns</strong>
        <button
          type="button"
          onClick={function () {
            dispatch(createPattern());
          }}
        >
          + New
        </button>
      </header>

      <div className="pattern-list-body">
        {patterns.map(function (pattern) {
          const isActive = pattern.id === activePatternId;

          return (
            <article
              key={pattern.id}
              className={"pattern-list-row" + (isActive ? " is-active" : "")}
              onMouseDown={function () {
                dispatch(setActivePattern(pattern.id));
              }}
            >
              <div className="pattern-list-row-top">
                <button
                  type="button"
                  className="pattern-list-select"
                  onClick={function (event) {
                    event.stopPropagation();
                    dispatch(setActivePattern(pattern.id));
                  }}
                >
                  {isActive ? "Active" : "Select"}
                </button>

                <input
                  className="pattern-list-name"
                  value={pattern.name}
                  maxLength={40}
                  onClick={function (event) {
                    event.stopPropagation();
                  }}
                  onChange={function (event) {
                    dispatch(
                      renamePattern({
                        patternId: pattern.id,
                        name: event.target.value,
                      }),
                    );
                  }}
                />
              </div>

              <div className="pattern-list-meta">
                <span>{Math.max(1, Math.ceil((pattern.lengthSteps || 16) / 16))} bars</span>
                <span>{clipCountByPattern[pattern.id] || 0} clips</span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
