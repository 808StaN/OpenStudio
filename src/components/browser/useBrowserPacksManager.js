import { useCallback, useEffect, useRef, useState } from "react";
import { isMidiFileName } from "../../utils/midiImport";
import { toSafeSampleUrl } from "../../utils/sampleUrl";
import { discoverPacksFromDirectoryIndex as discoverPacksFromDirectoryIndexUtil } from "./browserPackDiscoveryUtils";
import { buildPackTree, getPackParentPath, mergePackGroups } from "./browserPackUtils";

// Encapsulates Packs tab state and behavior:
// - manifest loading / fallback discovery
// - one-open-folder-per-parent expansion
// - sample preview dispatch
// - tree model generation
export function useBrowserPacksManager({ browserTab }) {
  const isFileProtocol =
    typeof window !== "undefined" && window.location.protocol === "file:";
  const [packGroups, setPackGroups] = useState([]);
  const [manifestStatus, setManifestStatus] = useState("loading");
  const [expandedByParent, setExpandedByParent] = useState({});
  const hasInitialPacksRefreshRunRef = useRef(false);

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

  const playSamplePreview = useCallback(function (samplePath) {
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
  }, []);

  const discoverPacksFromDirectoryIndex = useCallback(async function () {
    return discoverPacksFromDirectoryIndexUtil({
      isFileProtocol,
      makePacksPath,
    });
  }, [isFileProtocol, makePacksPath]);

  const toggleFolder = useCallback(function (folderPath) {
    const parentPath = getPackParentPath(folderPath);

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
  }, []);

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

  return {
    packGroups,
    manifestStatus,
    expandedByParent,
    toggleFolder,
    playSamplePreview,
    packTree,
  };
}
