import { FolderOpen, Package2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { PLUGIN_EFFECTS } from "../data/pluginEffects";
import { PLUGIN_INSTRUMENTS } from "../data/pluginInstruments";
import { setBrowserTab } from "../store";
import {
  buildMidiFileDragPayload,
  isMidiFileName,
  writeMidiFileToDataTransfer,
} from "../utils/midiImport";
import { toSafeSampleUrl } from "../utils/sampleUrl";

const PACK_MEDIA_EXTENSIONS = new Set([
  ".wav",
  ".wave",
  ".aif",
  ".aiff",
  ".mp3",
  ".ogg",
  ".flac",
  ".mid",
  ".midi",
]);

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

  const normalizeFolderPath = function (folderPath) {
    if (!folderPath || folderPath === "Root") {
      return "";
    }
    return folderPath;
  };

  const buildGroupsFromRelativePaths = useCallback(
    function (relativePaths) {
      const folderMap = new Map();

      relativePaths.forEach(function (relativePath) {
        const cleanRelative = String(relativePath || "")
          .replace(/^\/+/, "")
          .trim();
        if (!cleanRelative) {
          return;
        }

        const segments = cleanRelative.split("/").filter(Boolean);
        const fileName = segments[segments.length - 1];
        if (!fileName) {
          return;
        }

        const folderSegments = segments.slice(0, -1);
        if (folderSegments[0] === "__safe__") {
          return;
        }

        const folder =
          folderSegments.length > 0 ? folderSegments.join("/") : "Root";
        const encodedPath = makePacksPath(
          "packs/" +
            segments
              .map(function (segment) {
                return encodeURIComponent(segment);
              })
              .join("/"),
        );

        if (!folderMap.has(folder)) {
          folderMap.set(folder, []);
        }

        folderMap.get(folder).push({
          name: fileName,
          path: encodedPath,
        });
      });

      return Array.from(folderMap.entries())
        .map(function (entry) {
          const folder = entry[0];
          const items = entry[1];

          items.sort(function (a, b) {
            return a.name.localeCompare(b.name);
          });

          return {
            folder,
            items,
          };
        })
        .sort(function (a, b) {
          return a.folder.localeCompare(b.folder);
        });
    },
    [makePacksPath],
  );

  const mergeGroups = function (manifestFolders, discoveredFolders) {
    const mergedMap = new Map();

    const appendFolders = function (folders) {
      (Array.isArray(folders) ? folders : []).forEach(function (group) {
        const folder = String(group?.folder || "Root");
        if (!mergedMap.has(folder)) {
          mergedMap.set(folder, new Map());
        }

        const itemMap = mergedMap.get(folder);
        (Array.isArray(group?.items) ? group.items : []).forEach(
          function (item) {
            const name = String(item?.name || "").trim();
            const path = String(item?.path || "").trim();
            if (!name || !path) {
              return;
            }

            if (!itemMap.has(path)) {
              itemMap.set(path, {
                name,
                path,
              });
            }
          },
        );
      });
    };

    appendFolders(manifestFolders);
    appendFolders(discoveredFolders);

    return Array.from(mergedMap.entries())
      .map(function (entry) {
        const folder = entry[0];
        const items = Array.from(entry[1].values()).sort(function (a, b) {
          return a.name.localeCompare(b.name);
        });

        return {
          folder,
          items,
        };
      })
      .sort(function (a, b) {
        return a.folder.localeCompare(b.folder);
      });
  };

  const discoverPacksFromDirectoryIndex = useCallback(async function () {
    if (isFileProtocol) {
      return [];
    }

    const queue = ["/packs/"];
    const visited = new Set();
    const mediaRelativePaths = new Set();
    const maxDirectories = 250;

    while (queue.length > 0 && visited.size < maxDirectories) {
      const directoryUrl = queue.shift();
      if (!directoryUrl || visited.has(directoryUrl)) {
        continue;
      }

      visited.add(directoryUrl);

      let response = null;
      try {
        response = await fetch(directoryUrl + "?ts=" + Date.now(), {
          cache: "no-store",
        });
      } catch {
        continue;
      }

      if (!response.ok) {
        continue;
      }

      const contentType = String(
        response.headers.get("content-type") || "",
      ).toLowerCase();
      if (!contentType.includes("text/html")) {
        continue;
      }

      let html = "";
      try {
        html = await response.text();
      } catch {
        continue;
      }

      const doc = new DOMParser().parseFromString(html, "text/html");
      const links = Array.from(doc.querySelectorAll("a[href]"));

      links.forEach(function (anchor) {
        const href = String(anchor.getAttribute("href") || "").trim();
        if (!href || href === "/" || href.startsWith("#")) {
          return;
        }

        let resolved = null;
        try {
          resolved = new URL(href, window.location.origin + directoryUrl);
        } catch {
          return;
        }

        if (resolved.origin !== window.location.origin) {
          return;
        }

        const pathname = decodeURIComponent(resolved.pathname);
        if (!pathname.startsWith("/packs/")) {
          return;
        }

        if (pathname.endsWith("/")) {
          if (pathname.includes("/__safe__/")) {
            return;
          }

          queue.push(pathname);
          return;
        }

        const fileName = pathname.split("/").pop() || "";
        const extMatch = fileName.toLowerCase().match(/\.[^.]+$/);
        const ext = extMatch ? extMatch[0] : "";

        if (!PACK_MEDIA_EXTENSIONS.has(ext)) {
          return;
        }

        const relative = pathname.replace(/^\/packs\//, "");
        if (relative) {
          mediaRelativePaths.add(relative);
        }
      });
    }

    if (mediaRelativePaths.size === 0) {
      return [];
    }

    return buildGroupsFromRelativePaths(Array.from(mediaRelativePaths));
  }, [buildGroupsFromRelativePaths, isFileProtocol]);

  const buildPackTree = function (folders) {
    const root = {
      path: "",
      name: "",
      children: new Map(),
      samples: [],
    };

    folders.forEach(function (group) {
      const folderPath = normalizeFolderPath(group.folder);
      const segments = folderPath ? folderPath.split("/") : [];

      let currentNode = root;
      let currentPath = "";

      segments.forEach(function (segment) {
        currentPath = currentPath ? currentPath + "/" + segment : segment;
        if (!currentNode.children.has(segment)) {
          currentNode.children.set(segment, {
            path: currentPath,
            name: segment,
            children: new Map(),
            samples: [],
          });
        }
        currentNode = currentNode.children.get(segment);
      });

      group.items.forEach(function (item) {
        const sampleName = typeof item === "string" ? item : item.name;
        const samplePath =
          typeof item === "string"
            ? ""
            : item.path ||
              makePacksPath(
                "packs/" + normalizeFolderPath(group.folder) + "/" + item.name,
              );
        const itemType = isMidiFileName(sampleName) ? "midi" : "audio";

        currentNode.samples.push({
          name: sampleName,
          path: samplePath,
          type: itemType,
        });
      });
    });

    const sortNode = function (node) {
      const sortedChildren = Array.from(node.children.values())
        .sort(function (a, b) {
          return a.name.localeCompare(b.name);
        })
        .map(sortNode);

      const sortedSamples = node.samples.sort(function (a, b) {
        return a.name.localeCompare(b.name);
      });

      return {
        path: node.path,
        name: node.name,
        children: sortedChildren,
        samples: sortedSamples,
      };
    };

    return sortNode(root);
  };

  const getParentPath = function (folderPath) {
    const lastSlash = folderPath.lastIndexOf("/");
    if (lastSlash === -1) {
      return "";
    }
    return folderPath.slice(0, lastSlash);
  };

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
        const merged = mergeGroups(manifestFolders, discoveredFolders);

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

  const packTree = buildPackTree(packGroups);

  const renderFolderNode = function (node, depth) {
    const parentPath = getParentPath(node.path);
    const isOpen = expandedByParent[parentPath] === node.path;

    return (
      <section className="tree-group" key={node.path}>
        <button
          className="tree-folder"
          style={{ paddingLeft: 8 + depth * 14 + "px" }}
          onClick={function () {
            toggleFolder(node.path);
          }}
        >
          <span className="caret">{isOpen ? "v" : ">"}</span>
          {node.name}
        </button>

        <div className={"tree-collapse" + (isOpen ? " is-open" : "")}>
          <div className="tree-collapse-inner">
            <div className="tree-children">
              {node.children.map(function (childNode) {
                return renderFolderNode(childNode, depth + 1);
              })}

              {node.samples.length > 0 ? (
                <ul className="tree-list">
                  {node.samples.map(function (sampleItem) {
                    return (
                      <li
                        key={node.path + "-" + sampleItem.name}
                        className="tree-item"
                        style={{ marginLeft: 16 + depth * 14 + "px" }}
                        draggable
                        onClick={function () {
                          if (sampleItem.type === "audio") {
                            void playSamplePreview(sampleItem.path);
                          }
                        }}
                        onDragStart={function (event) {
                          if (sampleItem.type === "midi") {
                            const payload = buildMidiFileDragPayload({
                              fileName: sampleItem.name,
                              midiPath: sampleItem.path,
                            });

                            event.dataTransfer.effectAllowed = "copy";
                            writeMidiFileToDataTransfer(
                              event.dataTransfer,
                              payload,
                            );
                            return;
                          }

                          const safeSamplePath = toSafeSampleUrl(
                            sampleItem.path,
                          );
                          if (!safeSamplePath) {
                            event.preventDefault();
                            return;
                          }

                          const payload = JSON.stringify({
                            tab: "packs",
                            folder: node.path,
                            file: sampleItem.name,
                            samplePath: safeSamplePath,
                          });

                          event.dataTransfer.effectAllowed = "copy";
                          event.dataTransfer.setData(
                            "application/x-daw-sample",
                            payload,
                          );
                          event.dataTransfer.setData("text/plain", payload);
                        }}
                      >
                        {sampleItem.name}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    );
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
        {browserTab === "packs" && packGroups.length === 0 ? (
          <div className="browser-hint">
            {manifestStatus === "loading"
              ? "Loading packs..."
              : "Wklej WAV lub MID do public/packs i uruchom npm run refresh:packs (Packs)"}
          </div>
        ) : null}

        {browserTab === "plugins"
          ? browserData.plugins.map(function (group) {
              const isOpen = Boolean(pluginExpandedByFolder[group.folder]);
              return (
                <section className="tree-group" key={group.folder}>
                  <button
                    className="tree-folder plugin-folder"
                    onClick={function () {
                      togglePluginFolder(group.folder);
                    }}
                  >
                    <span className="caret">{isOpen ? "v" : ">"}</span>
                    {group.folder}
                  </button>

                  <div className={"tree-collapse" + (isOpen ? " is-open" : "")}>
                    <div className="tree-collapse-inner">
                      <ul className="tree-list">
                        {group.items.map(function (item) {
                          const isInstrument = group.type === "instrument";
                          const key = isInstrument
                            ? group.folder + "-" + item.pluginRef
                            : group.folder + "-" + item.effectType;
                          const payload = isInstrument
                            ? {
                                tab: "plugins",
                                type: "instrument",
                                pluginRef: item.pluginRef,
                                pluginName: item.name,
                              }
                            : {
                                tab: "plugins",
                                type: "effect",
                                effectType: item.effectType,
                                effectName: item.name,
                              };
                          const mimeType = isInstrument
                            ? "application/x-daw-plugin"
                            : "application/x-daw-effect";

                          return (
                            <li
                              key={key}
                              className={
                                "tree-item plugin-item" +
                                (isInstrument
                                  ? " instrument-item"
                                  : " effect-item")
                              }
                              title={item.description}
                              draggable
                              onDragStart={function (event) {
                                const payloadText = JSON.stringify(payload);
                                event.dataTransfer.setData(
                                  mimeType,
                                  payloadText,
                                );
                                event.dataTransfer.setData(
                                  "text/plain",
                                  payloadText,
                                );
                              }}
                            >
                              {item.name}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                </section>
              );
            })
          : packTree.children.map(function (node) {
              return renderFolderNode(node, 0);
            })}
      </div>
    </aside>
  );
}

