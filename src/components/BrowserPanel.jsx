import { FolderOpen, Package2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { PLUGIN_INSTRUMENTS } from "../data/pluginInstruments";
import { setBrowserTab } from "../store";

const browserData = {
  plugins: [
    {
      folder: "Instruments",
      items: PLUGIN_INSTRUMENTS,
    },
  ],
  drumkits: [
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
  const [drumkitGroups, setDrumkitGroups] = useState([]);
  const [manifestStatus, setManifestStatus] = useState("loading");
  const [expandedByParent, setExpandedByParent] = useState({});
  const previewAudioContextRef = useRef(null);
  const previewSourceRef = useRef(null);
  const previewBufferCacheRef = useRef(new Map());
  const previewBufferPromiseRef = useRef(new Map());

  const browserTab = useSelector(function (state) {
    return state.daw.ui.browserTab;
  });

  const ensurePreviewContext = function () {
    if (!previewAudioContextRef.current) {
      previewAudioContextRef.current = new AudioContext();
    }
    return previewAudioContextRef.current;
  };

  const getPreviewBuffer = async function (samplePath) {
    if (!samplePath) {
      return null;
    }

    const cachedBuffer = previewBufferCacheRef.current.get(samplePath);
    if (cachedBuffer) {
      return cachedBuffer;
    }

    const pendingBuffer = previewBufferPromiseRef.current.get(samplePath);
    if (pendingBuffer) {
      return pendingBuffer;
    }

    const loadPromise = (async function () {
      const context = ensurePreviewContext();
      const response = await fetch(samplePath);
      if (!response.ok) {
        throw new Error("Cannot load sample");
      }
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await context.decodeAudioData(arrayBuffer.slice(0));
      previewBufferCacheRef.current.set(samplePath, audioBuffer);
      return audioBuffer;
    })();

    previewBufferPromiseRef.current.set(samplePath, loadPromise);

    try {
      return await loadPromise;
    } finally {
      previewBufferPromiseRef.current.delete(samplePath);
    }
  };

  const playSamplePreview = async function (samplePath) {
    if (!samplePath) {
      return;
    }

    try {
      const context = ensurePreviewContext();
      if (context.state === "suspended") {
        await context.resume();
      }

      const buffer = await getPreviewBuffer(samplePath);
      if (!buffer) {
        return;
      }

      if (previewSourceRef.current) {
        try {
          previewSourceRef.current.stop();
        } catch {
          // Source can be already stopped.
        }
      }

      const source = context.createBufferSource();
      const gain = context.createGain();

      gain.gain.value = 0.85;
      source.buffer = buffer;
      source.connect(gain);
      gain.connect(context.destination);
      source.start();

      previewSourceRef.current = source;
      source.onended = function () {
        if (previewSourceRef.current === source) {
          previewSourceRef.current = null;
        }
      };
    } catch {
      // Ignore preview errors to keep UI responsive.
    }
  };

  const normalizeFolderPath = function (folderPath) {
    if (!folderPath || folderPath === "Root") {
      return "";
    }
    return folderPath;
  };

  const buildDrumkitTree = function (folders) {
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
              "/drumkits/" +
                normalizeFolderPath(group.folder) +
                "/" +
                item.name;

        currentNode.samples.push({
          name: sampleName,
          path: samplePath,
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

  const loadManifest = useCallback(async function () {
    setManifestStatus("loading");
    try {
      const response = await fetch("/drumkits/manifest.json?ts=" + Date.now(), {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Manifest not found");
      }

      const manifest = await response.json();
      setDrumkitGroups(Array.isArray(manifest.folders) ? manifest.folders : []);
      setManifestStatus("ready");
      setExpandedByParent({});
    } catch {
      setDrumkitGroups([]);
      setManifestStatus("missing");
      setExpandedByParent({});
    }
  }, []);

  useEffect(
    function () {
      let isDisposed = false;

      const loadSafe = async function () {
        if (isDisposed) {
          return;
        }
        await loadManifest();
      };

      void loadSafe();

      return function () {
        isDisposed = true;
      };
    },
    [loadManifest],
  );

  useEffect(
    function () {
      if (browserTab === "drumkits") {
        void loadManifest();
      }
    },
    [browserTab, loadManifest],
  );

  const drumkitTree = buildDrumkitTree(drumkitGroups);

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

        {isOpen ? (
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
                        void playSamplePreview(sampleItem.path);
                      }}
                      onDragStart={function (event) {
                        event.dataTransfer.setData(
                          "application/x-daw-sample",
                          JSON.stringify({
                            tab: "drumkits",
                            folder: node.path,
                            file: sampleItem.name,
                            samplePath: sampleItem.path,
                          }),
                        );
                      }}
                    >
                      {sampleItem.name}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        ) : null}
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
          className={browserTab === "drumkits" ? "is-active" : ""}
          onClick={function () {
            dispatch(setBrowserTab("drumkits"));
          }}
        >
          <FolderOpen size={14} />
          Drumkits
        </button>
      </div>

      {browserTab === "drumkits" ? (
        <div className="browser-actions">
          <button
            className="browser-rescan"
            onClick={function () {
              void loadManifest();
            }}
          >
            Odswiez Drumkity
          </button>
        </div>
      ) : null}

      <div className="browser-tree">
        {browserTab === "drumkits" && drumkitGroups.length === 0 ? (
          <div className="browser-hint">
            {manifestStatus === "loading"
              ? "Loading drumkits..."
              : "Wklej WAV do public/drumkits i uruchom npm run refresh:drumkits"}
          </div>
        ) : null}

        {browserTab === "plugins"
          ? browserData.plugins.map(function (group) {
              return (
                <section className="tree-group" key={group.folder}>
                  <div className="tree-folder plugin-folder">
                    <span className="caret">v</span>
                    {group.folder}
                  </div>
                  <ul className="tree-list">
                    {group.items.map(function (item) {
                      return (
                        <li
                          key={group.folder + "-" + item.pluginRef}
                          className="tree-item plugin-item"
                          title={item.description}
                          draggable
                          onDragStart={function (event) {
                            event.dataTransfer.setData(
                              "application/x-daw-plugin",
                              JSON.stringify({
                                tab: "plugins",
                                pluginRef: item.pluginRef,
                                pluginName: item.name,
                              }),
                            );
                          }}
                        >
                          {item.name}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })
          : drumkitTree.children.map(function (node) {
              return renderFolderNode(node, 0);
            })}
      </div>
    </aside>
  );
}
