import { FolderOpen, Package2 } from "lucide-react";
import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { BrowserPackTree } from "./browser/BrowserPackTree";
import { BrowserPluginTree } from "./browser/BrowserPluginTree";
import { BROWSER_PLUGIN_GROUPS } from "./browser/browserPluginGroups";
import { useBrowserPacksManager } from "./browser/useBrowserPacksManager";
import { setBrowserTab } from "../store";

export function BrowserPanel() {
  const dispatch = useDispatch();
  const [pluginExpandedByFolder, setPluginExpandedByFolder] = useState(
    function () {
      return BROWSER_PLUGIN_GROUPS.reduce(function (acc, group) {
        acc[group.folder] = false;
        return acc;
      }, {});
    },
  );

  const browserTab = useSelector(function (state) {
    return state.daw.ui.browserTab;
  });
  const {
    packGroups,
    manifestStatus,
    expandedByParent,
    toggleFolder,
    playSamplePreview,
    packTree,
  } = useBrowserPacksManager({ browserTab });

  const togglePluginFolder = function (folderName) {
    setPluginExpandedByFolder(function (previousState) {
      return {
        ...previousState,
        [folderName]: !previousState[folderName],
      };
    });
  };

  return (
    <aside className="browser-shell">
      <div className="browser-tabs">
        <button
          className={browserTab === "plugins" ? "is-active" : ""}
          onClick={function () {
            dispatch(setBrowserTab("plugins"));
          }}
        >
          <Package2 size={14} />
          Plugins
        </button>
        <button
          className={browserTab === "packs" ? "is-active" : ""}
          onClick={function () {
            dispatch(setBrowserTab("packs"));
          }}
        >
          <FolderOpen size={14} />
          Packs
        </button>
      </div>

      <div className="browser-tree">
        {browserTab === "plugins"
          ? (
            <BrowserPluginTree
              pluginGroups={BROWSER_PLUGIN_GROUPS}
              pluginExpandedByFolder={pluginExpandedByFolder}
              togglePluginFolder={togglePluginFolder}
            />
          )
          : (
            <BrowserPackTree
              packGroups={packGroups}
              manifestStatus={manifestStatus}
              packTree={packTree}
              expandedByParent={expandedByParent}
              toggleFolder={toggleFolder}
              playSamplePreview={playSamplePreview}
            />
          )}
      </div>
    </aside>
  );
}

