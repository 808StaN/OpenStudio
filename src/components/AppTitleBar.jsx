import { Minus, Square, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

function getElectronWindowApi() {
  if (typeof window === "undefined") {
    return null;
  }

  const api = window.electronWindow;
  if (!api || api.isDesktop !== true) {
    return null;
  }

  return api;
}

export function AppTitleBar() {
  const electronWindowApi = useMemo(function () {
    return getElectronWindowApi();
  }, []);
  const [isMaximized, setIsMaximized] = useState(true);

  useEffect(
    function () {
      if (!electronWindowApi) {
        return function () {};
      }

      let isMounted = true;
      electronWindowApi
        .isMaximized()
        .then(function (value) {
          if (!isMounted) {
            return;
          }

          setIsMaximized(Boolean(value));
        })
        .catch(function () {});

      const unsubscribe = electronWindowApi.onMaximizedChange(function (value) {
        setIsMaximized(Boolean(value));
      });

      return function () {
        isMounted = false;
        unsubscribe();
      };
    },
    [electronWindowApi],
  );

  if (!electronWindowApi) {
    return null;
  }

  const onDoubleClick = function (event) {
    if (!(event.target instanceof Element)) {
      return;
    }

    if (event.target.closest(".app-titlebar-controls")) {
      return;
    }

    electronWindowApi.toggleMaximize();
  };

  return (
    <div className="app-titlebar" onDoubleClick={onDoubleClick}>
      <div className="app-titlebar-brand">
        <img src="/favicon.png" alt="" className="app-titlebar-logo" />
        <span className="app-titlebar-name">OpenStudio</span>
      </div>

      <div className="app-titlebar-controls">
        <button
          type="button"
          className="app-titlebar-control"
          aria-label="Minimize window"
          onClick={function () {
            electronWindowApi.minimize();
          }}
        >
          <Minus size={14} />
        </button>
        <button
          type="button"
          className="app-titlebar-control"
          aria-label={isMaximized ? "Restore window" : "Maximize window"}
          onClick={function () {
            electronWindowApi.toggleMaximize();
          }}
        >
          <Square size={12} />
        </button>
        <button
          type="button"
          className="app-titlebar-control close"
          aria-label="Close window"
          onClick={function () {
            electronWindowApi.close();
          }}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
