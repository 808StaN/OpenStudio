// ------------------------------------------------------------------
// Project deserialization and migration logic.
// When a user loads a .os file, this routine sanitizes every field so
// the rest of the app never has to deal with corrupted / legacy data.
// ------------------------------------------------------------------

import {
  MAX_PLAYLIST_BARS,
  MIN_CLIP_BAR_LENGTH,
  UI_THEME_DEFAULT,
} from "./constants";
import {
  cloneSerializable,
  ensureInsertFxSlots,
  isObjectLike,
  makeFxSlots,
  makeInsertSpectrum,
  makeInsertWaveform,
  makeMaximizerStereoMeter,
  makeMidiPatternNoteId,
  makePlaylistTracks,
  normalizeBarValue,
  sanitizeLoadedSampleSettings,
  sanitizeUiTheme,
  getSafePatternColor,
} from "./utils";
import { initialState } from "./initialState";

/**
 * Normalizes a raw loaded state object into a safe, complete DAW state.
 * Returns null if the payload is fundamentally incompatible (e.g. missing
 * channels or patterns). The caller (loadProjectFromFile) should ignore
 * the load in that case.
 */
export function sanitizeLoadedDawState(currentState, rawLoadedState) {
  if (!isObjectLike(rawLoadedState)) {
    return null;
  }

  const loadedState = cloneSerializable(rawLoadedState);
  if (!isObjectLike(loadedState)) {
    return null;
  }

  // Use the current state as the primary fallback so we preserve unsaved
  // UI tweaks (window positions, theme, etc.) when reloading a project.
  const fallbackState =
    cloneSerializable(currentState) || cloneSerializable(initialState);
  if (!isObjectLike(fallbackState)) {
    return null;
  }

  // ---- Transport ---------------------------------------------------
  const transportRaw = isObjectLike(loadedState.transport)
    ? loadedState.transport
    : {};
  const nextTransport = {
    ...fallbackState.transport,
    ...transportRaw,
  };

  nextTransport.bpm = Math.max(
    40,
    Math.min(300, Math.round(Number(nextTransport.bpm || 140))),
  );
  nextTransport.mode = nextTransport.mode === "song" ? "song" : "pattern";
  nextTransport.songLoopEnabled = Boolean(nextTransport.songLoopEnabled);
  // Playback must never resume from a loaded file — force stop.
  nextTransport.isPlaying = false;
  nextTransport.isRecording = false;
  nextTransport.currentStep16 = 0;

  // ---- UI ----------------------------------------------------------
  const uiRaw = isObjectLike(loadedState.ui) ? loadedState.ui : {};
  const nextUi = {
    ...fallbackState.ui,
    ...uiRaw,
    windows: {
      ...fallbackState.ui.windows,
      ...(isObjectLike(uiRaw.windows) ? uiRaw.windows : {}),
    },
  };

  const allowedScaleRoots = new Set([
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
    "A",
    "A#",
    "B",
  ]);
  const scaleRoot = String(nextUi.pianoRollScaleRoot || "C")
    .trim()
    .toUpperCase();
  const scaleType = String(nextUi.pianoRollScaleType || "minor")
    .trim()
    .toLowerCase();
  nextUi.pianoRollScaleRoot = allowedScaleRoots.has(scaleRoot)
    ? scaleRoot
    : "C";
  nextUi.pianoRollScaleType = scaleType === "major" ? "major" : "minor";
  nextUi.theme = Object.hasOwn(uiRaw, "theme")
    ? sanitizeUiTheme(uiRaw.theme)
    : UI_THEME_DEFAULT;

  // ---- Project -----------------------------------------------------
  const projectRaw = isObjectLike(loadedState.project)
    ? loadedState.project
    : fallbackState.project;
  const nextProject = cloneSerializable(projectRaw);

  if (
    !isObjectLike(nextProject) ||
    !Array.isArray(nextProject.channels) ||
    !Array.isArray(nextProject.patterns)
  ) {
    return null;
  }

  // Channels
  nextProject.channels = nextProject.channels
    .map(function (channel, index) {
      if (!isObjectLike(channel)) {
        return null;
      }

      const safeId = String(channel.id || "ch-import-" + (index + 1)).trim();
      if (!safeId) {
        return null;
      }

      return {
        id: safeId,
        name: String(channel.name || "Channel " + (index + 1)).slice(0, 24),
        sampleRef: String(channel.sampleRef || "").trim(),
        pluginRef: String(channel.pluginRef || "").trim(),
        sampleSettings: sanitizeLoadedSampleSettings(channel.sampleSettings),
        muted: Boolean(channel.muted),
        solo: Boolean(channel.solo),
        volume: Math.max(0, Math.min(1, Number(channel.volume ?? 1))),
        pan: Math.max(-1, Math.min(1, Number(channel.pan ?? 0))),
        inputMode: channel.inputMode === "piano" ? "piano" : "steps",
        mixerInsertId: String(channel.mixerInsertId || "insert-1").trim(),
      };
    })
    .filter(Boolean);

  if (nextProject.channels.length === 0) {
    return null;
  }

  const channelIdSet = new Set(
    nextProject.channels.map(function (channel) {
      return channel.id;
    }),
  );

  // Patterns
  nextProject.patterns = nextProject.patterns
    .map(function (pattern, index) {
      if (!isObjectLike(pattern)) {
        return null;
      }

      const lengthSteps = Math.max(
        4,
        Math.min(128, Math.round(Number(pattern.lengthSteps || 16))),
      );
      const safeId = String(pattern.id || "pat-import-" + (index + 1)).trim();
      if (!safeId) {
        return null;
      }

      const rawStepGrid = isObjectLike(pattern.stepGrid)
        ? pattern.stepGrid
        : {};
      const stepGrid = {};
      nextProject.channels.forEach(function (channel) {
        const rawRow = Array.isArray(rawStepGrid[channel.id])
          ? rawStepGrid[channel.id]
          : [];

        stepGrid[channel.id] = Array.from({ length: lengthSteps }).map(
          function (_, rowIndex) {
            return Boolean(rawRow[rowIndex]);
          },
        );
      });

      const rawPianoPreview = isObjectLike(pattern.pianoPreview)
        ? pattern.pianoPreview
        : {};
      const pianoPreview = {};

      nextProject.channels.forEach(function (channel) {
        const rawNotes = Array.isArray(rawPianoPreview[channel.id])
          ? rawPianoPreview[channel.id]
          : [];

        pianoPreview[channel.id] = rawNotes
          .map(function (note) {
            if (!isObjectLike(note)) {
              return null;
            }

            const start = Math.max(
              0,
              Math.min(lengthSteps - 0.0625, Number(note.start || 0)),
            );
            const maxLen = Math.max(0.0625, lengthSteps - start);
            const length = Math.max(
              0.0625,
              Math.min(maxLen, Number(note.length || 1)),
            );

            return {
              id:
                String(note.id || "").trim() || makeMidiPatternNoteId("load"),
              start,
              length,
              pitch: Math.max(
                0,
                Math.min(
                  127,
                  Math.round(Number(note.pitch || 72)),
                ),
              ),
              velocity: Math.max(
                1,
                Math.min(
                  127,
                  Math.round(Number(note.velocity || 95)),
                ),
              ),
            };
          })
          .filter(Boolean)
          .sort(function (a, b) {
            if (a.start !== b.start) {
              return a.start - b.start;
            }
            return b.pitch - a.pitch;
          });
      });

      return {
        id: safeId,
        name: String(pattern.name || "Pattern " + (index + 1)).slice(0, 40),
        color: getSafePatternColor(pattern.color),
        lengthSteps,
        stepGrid,
        pianoPreview,
      };
    })
    .filter(Boolean);

  if (nextProject.patterns.length === 0) {
    return null;
  }

  // Playlist tracks
  nextProject.playlistTracks = Array.isArray(nextProject.playlistTracks)
    ? nextProject.playlistTracks
        .map(function (track, index) {
          if (!isObjectLike(track)) {
            return null;
          }

          const safeId = String(track.id || "trk-" + (index + 1)).trim();
          if (!safeId) {
            return null;
          }

          return {
            id: safeId,
            name: String(track.name || "Track " + (index + 1)).slice(0, 40),
          };
        })
        .filter(Boolean)
    : [];

  if (nextProject.playlistTracks.length === 0) {
    nextProject.playlistTracks = makePlaylistTracks(10);
  }

  const trackIdSet = new Set(
    nextProject.playlistTracks.map(function (track) {
      return track.id;
    }),
  );
  const patternIdSet = new Set(
    nextProject.patterns.map(function (pattern) {
      return pattern.id;
    }),
  );

  // Playlist clips
  nextProject.playlistClips = Array.isArray(nextProject.playlistClips)
    ? nextProject.playlistClips
        .map(function (clip, index) {
          if (!isObjectLike(clip)) {
            return null;
          }

          const clipType =
            clip.clipType === "audio" || clip.clipType === "pattern"
              ? clip.clipType
              : "pattern";
          const trackId = String(clip.trackId || "").trim();
          if (!trackIdSet.has(trackId)) {
            return null;
          }

          const barStart = normalizeBarValue(
            clip.barStart || 1,
            1,
            MAX_PLAYLIST_BARS,
          );
          const barLength = normalizeBarValue(
            clip.barLength || 1,
            MIN_CLIP_BAR_LENGTH,
            64,
          );

          if (clipType === "pattern") {
            const patternId = String(clip.patternId || "").trim();
            if (!patternIdSet.has(patternId)) {
              return null;
            }

            return {
              id: String(clip.id || "").trim() || "clip-load-" + (index + 1),
              clipType,
              patternId,
              trackId,
              barStart,
              barLength,
              sourceOffsetSteps: Math.max(
                0,
                Number(clip.sourceOffsetSteps || 0),
              ),
            };
          }

          const samplePath = String(clip.samplePath || "").trim();
          if (!samplePath) {
            return null;
          }

          const maybeChannelId = String(clip.channelId || "").trim();
          const autoStretchSync = clip.autoStretchSync === false ? false : true;
          return {
            id: String(clip.id || "").trim() || "clip-load-" + (index + 1),
            clipType,
            samplePath,
            audioName: String(clip.audioName || "Audio").trim() || "Audio",
            channelId: channelIdSet.has(maybeChannelId)
              ? maybeChannelId
              : undefined,
            trackId,
            barStart,
            barLength,
            sourceOffsetSteps: Math.max(0, Number(clip.sourceOffsetSteps || 0)),
            autoStretchSync,
          };
        })
        .filter(Boolean)
    : [];

  nextProject.activePatternId = patternIdSet.has(nextProject.activePatternId)
    ? nextProject.activePatternId
    : nextProject.patterns[0].id;

  nextProject.activeChannelId = channelIdSet.has(nextProject.activeChannelId)
    ? nextProject.activeChannelId
    : nextProject.channels[0].id;

  // ---- Mixer -------------------------------------------------------
  const mixerRaw = isObjectLike(loadedState.mixer)
    ? loadedState.mixer
    : fallbackState.mixer;
  const nextMixer = cloneSerializable(mixerRaw);

  if (!isObjectLike(nextMixer) || !Array.isArray(nextMixer.inserts)) {
    return null;
  }

  nextMixer.inserts = nextMixer.inserts
    .map(function (insert, index) {
      if (!isObjectLike(insert)) {
        return null;
      }

      const rawId = String(insert.id || "").trim();
      const isMaster = insert.isMaster === true || rawId === "master";
      const safeId = isMaster ? "master" : rawId || "insert-" + (index + 1);

      const normalizedInsert = {
        ...insert,
        id: safeId,
        name: String(
          insert.name || (isMaster ? "Master" : "Insert " + (index + 1)),
        ).trim(),
        isMaster,
        active: isMaster ? true : Boolean(insert.active),
        pan: Math.max(-1, Math.min(1, Number(insert.pan || 0))),
        stereoSeparation: Math.max(
          -1,
          Math.min(1, Number(insert.stereoSeparation || 0)),
        ),
        fader: Math.max(0, Math.min(1.25, Number(insert.fader || 1))),
        meter: 0,
        meterSpectrum: makeInsertSpectrum(),
        routesTo: Array.isArray(insert.routesTo)
          ? insert.routesTo.map(function (routeId) {
              return String(routeId || "").trim();
            })
          : isMaster
            ? []
            : ["master"],
      };

      ensureInsertFxSlots(normalizedInsert);
      return normalizedInsert;
    })
    .filter(Boolean);

  if (nextMixer.inserts.length === 0) {
    return null;
  }

  // Ensure a master insert always exists.
  const masterExists = nextMixer.inserts.some(function (insert) {
    return insert.isMaster || insert.id === "master";
  });

  if (!masterExists) {
    nextMixer.inserts.unshift({
      id: "master",
      name: "Master",
      isMaster: true,
      active: true,
      pan: 0,
      stereoSeparation: 0,
      fader: 1,
      meter: 0,
      meterSpectrum: makeInsertSpectrum(),
      routesTo: [],
      fxSlots: makeFxSlots(),
    });
  }

  // Ensure the five default inserts exist (legacy projects may lack them).
  const requiredInserts = [
    "insert-1",
    "insert-2",
    "insert-3",
    "insert-4",
    "insert-5",
  ];
  requiredInserts.forEach(function (insertId, index) {
    const exists = nextMixer.inserts.some(function (insert) {
      return !insert.isMaster && insert.id === insertId;
    });

    if (!exists) {
      nextMixer.inserts.push({
        id: insertId,
        name: "Insert " + (index + 1),
        isMaster: false,
        active: true,
        pan: 0,
        stereoSeparation: 0,
        fader: 1,
        meter: 0,
        meterSpectrum: makeInsertSpectrum(),
        meterWaveform: makeInsertWaveform(),
        maximizerReduction: 0,
        maximizerOutputDb: -96,
        maximizerStereoMeter: makeMaximizerStereoMeter(),
        routesTo: ["master"],
        fxSlots: makeFxSlots(),
      });
    }
  });

  // Historical quirk: insert-4 must be active.
  const insert4 = nextMixer.inserts.find(function (insert) {
    return !insert.isMaster && insert.id === "insert-4";
  });
  if (insert4) {
    insert4.active = true;
  }

  const insertIdSet = new Set(
    nextMixer.inserts.map(function (insert) {
      return insert.id;
    }),
  );

  const firstNonMasterInsert =
    nextMixer.inserts.find(function (insert) {
      return !insert.isMaster;
    }) ||
    nextMixer.inserts.find(function (insert) {
      return insert.id !== "master";
    });
  const fallbackInsertId = firstNonMasterInsert
    ? firstNonMasterInsert.id
    : "insert-1";

  // Re-map channel inserts to known insert IDs.
  nextProject.channels = nextProject.channels.map(function (channel) {
    const requestedInsertId = String(channel.mixerInsertId || "").trim();
    return {
      ...channel,
      mixerInsertId: insertIdSet.has(requestedInsertId)
        ? requestedInsertId
        : fallbackInsertId,
    };
  });

  if (!insertIdSet.has(nextMixer.selectedInsertId)) {
    nextMixer.selectedInsertId =
      fallbackInsertId === "insert-1" && insertIdSet.has("insert-1")
        ? "insert-1"
        : nextMixer.inserts[0].id;
  }

  return {
    transport: nextTransport,
    ui: nextUi,
    project: nextProject,
    mixer: nextMixer,
  };
}
