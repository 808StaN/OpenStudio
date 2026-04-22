import { FolderOpen, Package2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { PLUGIN_EFFECTS } from "../data/pluginEffects";
import { PLUGIN_INSTRUMENTS } from "../data/pluginInstruments";
import { BrowserPackTree } from "./browser/BrowserPackTree";
import { BrowserPluginTree } from "./browser/BrowserPluginTree";
import {
  buildPackTree,
  getPackParentPath,
  mergePackGroups,
} from "./browser/browserPackUtils";
import {
  discoverPacksFromDirectoryIndex as discoverPacksFromDirectoryIndexUtil,
} from "./browser/browserPackDiscoveryUtils";
import { setBrowserTab } from "../store";
import {
  isMidiFileName,
} from "../utils/midiImport";
import { toSafeSampleUrl } from "../utils/sampleUrl";

const browserData = {
  plugins: [
    {
      folder: "Instruments",
      type: "instrument",
      items: PLUGIN_INSTRUMENTS,
    },
    {
      folder: "Effects",
      type: "effect",
      items: PLUGIN_EFFECTS,
    },
  ],
  packs: [
    {
      folder: "808 Mafia",
      items: [
        "808_dark.wav",
        "kick_punch.wav",
        "snare_crisp.wav",
        "hat_roll.wav",
      ],
    },
    {
      folder: "Nick Mira",
      items: [
        "808_nx.wav",
        "kick_bounce.wav",
        "clap_short.wav",
        "perc_metal.wav",
      ],
    },
  ],
};

export function BrowserPanel() {
  const dispatch = useDispatch();
  const isFileProtocol =
    typeof window !== "undefined" && window.location.protocol === "file:";
  const makePacksPath = useCallback(
    function (relativePath) {
      const cleanRelative = String(relativePath || "")
        .replace(/^\/+/, "")
        .trim();
      if (!cleanRelative) {
        return isFileProtocol ? "openstudio://packs/" : "/packs/";
      }

      if (isFileProtocol) {
        const normalized = cleanRelative.replace(/^packs\/?/i, "");
        return (
          "openstudio://packs/" +
          normalized
            .split("/")
            .filter(Boolean)
            .map(function (segment) {
              return encodeURIComponent(segment);
            })
            .join("/")
        );
      }

      return "/" + cleanRelative;
    },
    [isFileProtocol],
  );
  const [packGroups, setPackGroups] = useState([]);
  const [manifestStatus, setManifestStatus] = useState("loading");
  const [expandedByParent, setExpandedByParent] = useState({});
  const hasInitialPacksRefreshRunRef = useRef(false);
  const [pluginExpandedByFolder, setPluginExpandedByFolder] = useState(
    function () {
      return browserData.plugins.reduce(function (acc, group) {
        acc[group.folder] = false;
        return acc;
      }, {});
    },
  );

  const browserTab = useSelector(function (state) {
    return state.daw.ui.browserTab;
  });

  const playSamplePreview = function (samplePath) {
    const safeSamplePath = toSafeSampleUrl(samplePath);
    if (!safeSamplePath) {
      return;
    }

    window.dispatchEvent(
      new CustomEvent("openstudio:packs-preview", {
        detail: {
          samplePath: safeSamplePath,
        },
      }),
    );
  };

  const discoverPacksFromDirectoryIndex = useCallback(
    async function () {
      return discoverPacksFromDirectoryIndexUtil({
        isFileProtocol,
        makePacksPath,
      });
    },
    [isFileProtocol, makePacksPath],
  );

  const getParentPath = getPackParentPath;

  const toggleFolder = function (folderPath) {
    const parentPath = getParentPath(folderPath);

    setExpandedByParent(function (previousState) {
      const nextState = { ...previousState };
      const currentlyOpen = nextState[parentPath];

      if (currentlyOpen === folderPath) {
        delete nextState[parentPath];
      } else {
        nextState[parentPath] = folderPath;
      }

      const prefixesToClear = [currentlyOpen, folderPath]
        .filter(Boolean)
        .map(function (item) {
          return item + "/";
        });

      Object.keys(nextState).forEach(function (key) {
        if (
          prefixesToClear.some(function (prefix) {
            return key.startsWith(prefix);
          })
        ) {
          delete nextState[key];
        }
      });

      return nextState;
    });
  };

  const togglePluginFolder = function (folderName) {
    setPluginExpandedByFolder(function (previousState) {
      return {
        ...previousState,
        [folderName]: !previousState[folderName],
      };
    });
  };

  const loadManifest = useCallback(
    async function () {
      setManifestStatus("loading");
      try {
        const normalizePackItemPath = function (rawPath) {
          const input = String(rawPath || "").trim();
          if (!input) {
            return "";
          }

          if (/^(https?:|file:|openstudio:)/i.test(input)) {
            return input;
          }

          const noLeadingSlash = input.replace(/^\/+/, "");
          if (noLeadingSlash.startsWith("packs/")) {
            return makePacksPath(noLeadingSlash);
          }

          return makePacksPath("packs/" + noLeadingSlash);
        };

        const response = await fetch(
          makePacksPath("packs/manifest.json") + "?ts=" + Date.now(),
          {
            cache: "no-store",
          },
        );

        if (!response.ok) {
          const discoveredFolders = await discoverPacksFromDirectoryIndex();
          if (discoveredFolders.length === 0) {
            throw new Error("Manifest not found");
          }

          setPackGroups(discoveredFolders);
          setManifestStatus("ready");
          return;
        }

        const manifest = await response.json();
        const manifestFolders = Array.isArray(manifest.folders)
          ? manifest.folders.map(function (group) {
              return {
                ...group,
                items: (Array.isArray(group?.items) ? group.items : []).map(
                  function (item) {
                    if (typeof item === "string") {
                      return item;
                    }

                    return {
                      ...item,
                      path: normalizePackItemPath(item?.path),
                    };
                  },
                ),
              };
            })
          : [];
        const discoveredFolders = await discoverPacksFromDirectoryIndex();
        const merged = mergePackGroups(manifestFolders, discoveredFolders);

        setPackGroups(merged);
        setManifestStatus("ready");
      } catch {
        setPackGroups([]);
        setManifestStatus("missing");
      }
    },
    [discoverPacksFromDirectoryIndex, makePacksPath],
  );

  const triggerPacksRescan = useCallback(
    async function () {
      try {
        await fetch("/__openstudio/refresh-packs", {
          method: "POST",
          cache: "no-store",
        });
      } catch {
        // Ignore endpoint failures outside dev; manifest reload still runs.
      }

      await loadManifest();
    },
    [loadManifest],
  );

  useEffect(
    function () {
      let isCancelled = false;

      const refreshOnStart = async function () {
        if (isCancelled || hasInitialPacksRefreshRunRef.current) {
          return;
        }

        hasInitialPacksRefreshRunRef.current = true;
        await triggerPacksRescan();
      };

      void refreshOnStart();

      return function () {
        isCancelled = true;
      };
    },
    [triggerPacksRescan],
  );

  useEffect(
    function () {
      if (browserTab === "packs") {
        void triggerPacksRescan();
      }
    },
    [browserTab, triggerPacksRescan],
  );

  const packTree = buildPackTree({
    folders: packGroups,
    isMidiFileNameFn: isMidiFileName,
    makePacksPathFn: makePacksPath,
  });

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
              pluginGroups={browserData.plugins}
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

