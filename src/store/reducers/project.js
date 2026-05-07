// ------------------------------------------------------------------
// Project reducers — channels, patterns, playlist, and piano-roll notes.
// This is the largest domain slice because the beat-making surface is
// where most user mutations happen. Every reducer is defensive:
// it verifies IDs exist before mutating and clamps numeric inputs.
// ------------------------------------------------------------------

import {
  MAX_PLAYLIST_BARS,
  MIN_CLIP_BAR_LENGTH,
} from "../constants";
import {
  cloneSerializable,
  getNextPatternNumber,
  getSafePatternColor,
  makeChannelId,
  makeEmptyPattern,
  makeMidiPatternNoteId,
  makeStepRow,
  nearlyEqual,
  normalizeBarValue,
  sanitizeLoadedSampleSettings,
} from "../utils";

export const projectReducers = {
  // ----------------------------------------------------------------
  // Pattern lifecycle
  // ----------------------------------------------------------------

  setActivePattern(state, action) {
    const patternId = action.payload;
    const exists = state.project.patterns.some(function (pattern) {
      return pattern.id === patternId;
    });
    if (!exists) {
      return;
    }

    state.project.activePatternId = patternId;
  },

  createPattern(state, action) {
    const activePattern = state.project.patterns.find(function (item) {
      return item.id === state.project.activePatternId;
    });

    const requestedLength = Number(action.payload?.lengthSteps);
    const baseLength = Math.max(
      4,
      Math.min(
        128,
        Math.round(
          Number.isFinite(requestedLength)
            ? requestedLength
            : activePattern?.lengthSteps || 16,
        ),
      ),
    );

    const nextPatternNumber = getNextPatternNumber(state.project.patterns);

    const newPatternId =
      "pat-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 6);

    const newPattern = makeEmptyPattern({
      id: newPatternId,
      name: "Pattern " + nextPatternNumber,
      lengthSteps: baseLength,
      channels: state.project.channels,
    });

    state.project.patterns.push(newPattern);
    state.project.activePatternId = newPatternId;
  },

  duplicatePatterns(state, action) {
    const requestedIdsRaw = Array.isArray(action.payload?.patternIds)
      ? action.payload.patternIds
      : [];
    const requestedIds = requestedIdsRaw
      .map(function (patternId) {
        return String(patternId || "").trim();
      })
      .filter(Boolean);

    if (requestedIds.length === 0) {
      requestedIds.push(String(state.project.activePatternId || "").trim());
    }

    const requestedIdSet = new Set(requestedIds);
    const sourcePatterns = state.project.patterns.filter(function (pattern) {
      return requestedIdSet.has(pattern.id);
    });

    if (sourcePatterns.length === 0) {
      return;
    }

    let nextPatternNumber = getNextPatternNumber(state.project.patterns);
    const duplicates = sourcePatterns.map(function (sourcePattern) {
      const nextId =
        "pat-" +
        Date.now().toString(36) +
        "-" +
        Math.random().toString(36).slice(2, 6);

      // Reconstruct a clean copy via makeEmptyPattern + manual merge so
      // we preserve exact step grids and pianoPreview notes.
      const next = makeEmptyPattern({
        id: nextId,
        name: "Pattern " + nextPatternNumber,
        lengthSteps: sourcePattern.lengthSteps,
        channels: state.project.channels,
      });
      next.stepGrid = cloneSerializable(sourcePattern.stepGrid) || next.stepGrid;
      next.pianoPreview = cloneSerializable(sourcePattern.pianoPreview) || next.pianoPreview;
      next.color = getSafePatternColor(sourcePattern.color);

      nextPatternNumber += 1;
      return next;
    });

    state.project.patterns.push(...duplicates);
    state.project.activePatternId = duplicates[duplicates.length - 1].id;
  },

  renamePattern(state, action) {
    const pattern = state.project.patterns.find(function (item) {
      return item.id === action.payload.patternId;
    });
    if (!pattern) {
      return;
    }

    const nextName = String(action.payload.name || "").trim();
    if (!nextName) {
      return;
    }

    pattern.name = nextName.slice(0, 40);
  },

  setPatternColor(state, action) {
    const pattern = state.project.patterns.find(function (item) {
      return item.id === action.payload.patternId;
    });
    if (!pattern) {
      return;
    }

    const nextColor = getSafePatternColor(action.payload.color);
    if (pattern.color === nextColor) {
      return;
    }

    pattern.color = nextColor;
  },

  setPatternLength(state, action) {
    const pattern = state.project.patterns.find(function (item) {
      return item.id === action.payload.patternId;
    });
    if (!pattern) {
      return;
    }

    const nextLength = Math.max(
      4,
      Math.min(128, Math.round(action.payload.length || 16)),
    );
    const prevLength = pattern.lengthSteps || 16;

    if (nextLength === prevLength) {
      return;
    }

    pattern.lengthSteps = nextLength;

    state.project.channels.forEach(function (channel) {
      const existingRow =
        pattern.stepGrid[channel.id] || Array(prevLength).fill(false);

      if (existingRow.length < nextLength) {
        pattern.stepGrid[channel.id] = existingRow.concat(
          Array(nextLength - existingRow.length).fill(false),
        );
        return;
      }

      pattern.stepGrid[channel.id] = existingRow.slice(0, nextLength);

      const existingNotes = pattern.pianoPreview?.[channel.id] || [];
      pattern.pianoPreview[channel.id] = existingNotes
        .filter(function (note) {
          return note.start < nextLength;
        })
        .map(function (note) {
          const maxLen = Math.max(0.0625, nextLength - note.start);
          return {
            ...note,
            length: Math.max(
              0.0625,
              Math.min(maxLen, Number(note.length || 1)),
            ),
          };
        });
    });

    if (state.transport.currentStep16 >= nextLength) {
      state.transport.currentStep16 = 0;
    }
  },

  // ----------------------------------------------------------------
  // Sequencer step grid
  // ----------------------------------------------------------------

  toggleStep(state, action) {
    const pattern = state.project.patterns.find(function (item) {
      return item.id === action.payload.patternId;
    });
    if (!pattern) {
      return;
    }
    const row = pattern.stepGrid[action.payload.channelId];
    if (!row) {
      return;
    }
    const index = action.payload.stepIndex;
    row[index] = !row[index];
  },

  // ----------------------------------------------------------------
  // Playlist clips
  // ----------------------------------------------------------------

  addPlaylistPatternClip(state, action) {
    const patternId =
      action.payload.patternId || state.project.activePatternId;
    const pattern = state.project.patterns.find(function (item) {
      return item.id === patternId;
    });
    if (!pattern) {
      return;
    }

    const trackId = action.payload.trackId;
    const hasTrack = state.project.playlistTracks.some(function (track) {
      return track.id === trackId;
    });
    if (!hasTrack) {
      return;
    }

    const barStart = normalizeBarValue(
      action.payload.barStart || 1,
      1,
      MAX_PLAYLIST_BARS,
    );

    const patternBarLength = Math.max(
      1,
      Math.ceil((pattern.lengthSteps || 16) / 16),
    );
    const barLength = normalizeBarValue(
      action.payload.barLength || patternBarLength,
      MIN_CLIP_BAR_LENGTH,
      64,
    );

    state.project.playlistClips.push({
      id:
        "clip-" +
        Date.now().toString(36) +
        "-" +
        Math.random().toString(36).slice(2, 6),
      clipType: "pattern",
      patternId,
      trackId,
      barStart,
      barLength,
      sourceOffsetSteps: 0,
    });

    sortPlaylistClips(state.project.playlistClips, state.project.playlistTracks);
  },

  addPlaylistAudioClip(state, action) {
    const trackId = action.payload.trackId;
    const hasTrack = state.project.playlistTracks.some(function (track) {
      return track.id === trackId;
    });
    if (!hasTrack) {
      return;
    }

    const samplePath = String(action.payload.samplePath || "").trim();
    if (!samplePath) {
      return;
    }

    const clipName =
      String(action.payload.clipName || "").trim() ||
      samplePath.split("/").pop() ||
      "Audio";

    const barStart = normalizeBarValue(
      action.payload.barStart || 1,
      1,
      MAX_PLAYLIST_BARS,
    );
    const barLength = normalizeBarValue(
      action.payload.barLength || 2,
      MIN_CLIP_BAR_LENGTH,
      64,
    );
    const requestedChannelId = String(action.payload.channelId || "").trim();
    const channelId = requestedChannelId
      ? state.project.channels.some(function (channel) {
          return channel.id === requestedChannelId;
        })
        ? requestedChannelId
        : undefined
      : undefined;
    const sourceOffsetSteps = Math.max(
      0,
      Number(action.payload.sourceOffsetSteps || 0),
    );

    state.project.playlistClips.push({
      id:
        "clip-" +
        Date.now().toString(36) +
        "-" +
        Math.random().toString(36).slice(2, 6),
      clipType: "audio",
      samplePath,
      audioName: clipName,
      channelId,
      trackId,
      barStart,
      barLength,
      sourceOffsetSteps,
      autoStretchSync: true,
    });

    sortPlaylistClips(state.project.playlistClips, state.project.playlistTracks);
  },

  addPlaylistSampleAsChannel(state, action) {
    const trackId = String(action.payload.trackId || "").trim();
    const hasTrack = state.project.playlistTracks.some(function (track) {
      return track.id === trackId;
    });
    if (!hasTrack) {
      return;
    }

    const sampleRef = String(action.payload.samplePath || "").trim();
    if (!sampleRef) {
      return;
    }

    const barStart = normalizeBarValue(
      action.payload.barStart || 1,
      1,
      MAX_PLAYLIST_BARS,
    );
    const barLength = normalizeBarValue(
      action.payload.barLength || 2,
      MIN_CLIP_BAR_LENGTH,
      64,
    );

    const rawSampleName =
      String(action.payload.clipName || "").trim() ||
      sampleRef.split("/").pop() ||
      "Sample";
    const decodedName = (function () {
      try {
        return decodeURIComponent(rawSampleName);
      } catch {
        return rawSampleName;
      }
    })();
    const channelName = decodedName.replace(/\.[^.]+$/, "").slice(0, 14);

    const newChannelId = makeChannelId();
    const preferredInsert = state.mixer.inserts.find(function (insert) {
      return insert.id === "insert-1";
    });
    const firstInsert = state.mixer.inserts.find(function (insert) {
      return !insert.isMaster;
    });

    state.project.channels.push({
      id: newChannelId,
      name: channelName || "Sample",
      sampleRef,
      pluginRef: "",
      sampleSettings: sanitizeLoadedSampleSettings(null),
      muted: false,
      solo: false,
      volume: 1,
      pan: 0,
      inputMode: "steps",
      mixerInsertId: preferredInsert?.id || firstInsert?.id || "insert-1",
    });

    state.project.patterns.forEach(function (pattern) {
      if (!pattern.stepGrid) {
        pattern.stepGrid = {};
      }

      const length = Math.max(1, pattern.lengthSteps || 16);
      pattern.stepGrid[newChannelId] = makeStepRow(length, []);
    });

    state.project.playlistClips.push({
      id:
        "clip-" +
        Date.now().toString(36) +
        "-" +
        Math.random().toString(36).slice(2, 6),
      clipType: "audio",
      samplePath: sampleRef,
      audioName: decodedName,
      channelId: newChannelId,
      trackId,
      barStart,
      barLength,
      sourceOffsetSteps: 0,
      autoStretchSync: true,
    });

    sortPlaylistClips(state.project.playlistClips, state.project.playlistTracks);

    state.project.activeChannelId = newChannelId;
  },

  addPlaylistTrack(state) {
    const nextTrackNumber =
      state.project.playlistTracks.reduce(function (maxNumber, track) {
        const fromId = String(track.id || "").match(/trk-(\d+)/i);
        const fromName = String(track.name || "").match(/track\s+(\d+)/i);
        const idNumber = fromId ? Number(fromId[1]) : 0;
        const nameNumber = fromName ? Number(fromName[1]) : 0;
        return Math.max(maxNumber, idNumber, nameNumber);
      }, 0) + 1;

    state.project.playlistTracks.push({
      id: "trk-" + nextTrackNumber,
      name: "Track " + nextTrackNumber,
    });
  },

  removePlaylistClip(state, action) {
    state.project.playlistClips = state.project.playlistClips.filter(
      function (clip) {
        return clip.id !== action.payload;
      },
    );
  },

  setPlaylistClipLength(state, action) {
    const clip = state.project.playlistClips.find(function (item) {
      return item.id === action.payload.clipId;
    });
    if (!clip) {
      return;
    }

    const currentStart = normalizeBarValue(
      clip.barStart || 1,
      1,
      MAX_PLAYLIST_BARS,
    );
    const maxLengthByTimeline = Math.max(
      MIN_CLIP_BAR_LENGTH,
      MAX_PLAYLIST_BARS - currentStart + 1,
    );
    const requestedLength = normalizeBarValue(
      action.payload.barLength || 1,
      MIN_CLIP_BAR_LENGTH,
      64,
    );

    clip.barLength = normalizeBarValue(
      requestedLength,
      MIN_CLIP_BAR_LENGTH,
      maxLengthByTimeline,
    );

    if (
      String(clip.clipType || "").toLowerCase() === "audio" &&
      action.payload.manualResize === true
    ) {
      clip.autoStretchSync = false;
    }
  },

  setPlaylistClipPlacement(state, action) {
    const clip = state.project.playlistClips.find(function (item) {
      return item.id === action.payload.clipId;
    });
    if (!clip) {
      return;
    }

    const trackId = action.payload.trackId || clip.trackId;
    const hasTrack = state.project.playlistTracks.some(function (track) {
      return track.id === trackId;
    });
    if (!hasTrack) {
      return;
    }

    const clipLength = normalizeBarValue(
      clip.barLength || 1,
      MIN_CLIP_BAR_LENGTH,
      64,
    );
    const maxStartByTimeline = Math.max(
      1,
      MAX_PLAYLIST_BARS - clipLength + 1,
    );
    const desiredStart = normalizeBarValue(
      action.payload.barStart || 1,
      1,
      maxStartByTimeline,
    );

    clip.trackId = trackId;
    clip.barStart = desiredStart;

    sortPlaylistClips(state.project.playlistClips, state.project.playlistTracks);
  },

  setPlaylistClipTrimStart(state, action) {
    const clip = state.project.playlistClips.find(function (item) {
      return item.id === action.payload.clipId;
    });
    if (!clip) {
      return;
    }

    const nextStart = normalizeBarValue(
      action.payload.barStart || clip.barStart || 1,
      1,
      MAX_PLAYLIST_BARS,
    );
    const maxLengthByTimeline = Math.max(
      MIN_CLIP_BAR_LENGTH,
      MAX_PLAYLIST_BARS - nextStart + 1,
    );
    const nextLength = normalizeBarValue(
      action.payload.barLength || clip.barLength || 1,
      MIN_CLIP_BAR_LENGTH,
      maxLengthByTimeline,
    );

    clip.barStart = nextStart;
    clip.barLength = nextLength;
    clip.sourceOffsetSteps = Math.max(
      0,
      Number(action.payload.sourceOffsetSteps || 0),
    );

    if (
      String(clip.clipType || "").toLowerCase() === "audio" &&
      action.payload.manualResize === true
    ) {
      clip.autoStretchSync = false;
    }
  },

  // ----------------------------------------------------------------
  // Channels
  // ----------------------------------------------------------------

  setActiveChannel(state, action) {
    const channelId = action.payload;
    const exists = state.project.channels.some(function (channel) {
      return channel.id === channelId;
    });

    if (!exists) {
      return;
    }

    state.project.activeChannelId = channelId;
  },

  addChannel(state) {
    const nextChannelNumber = state.project.channels.length + 1;
    const newChannelId = makeChannelId();
    const mixerTargets = state.mixer.inserts.filter(function (insert) {
      return !insert.isMaster;
    });
    const targetInsert =
      mixerTargets[Math.min(nextChannelNumber - 1, mixerTargets.length - 1)];

    state.project.channels.push({
      id: newChannelId,
      name: "Channel " + nextChannelNumber,
      sampleRef: "",
      pluginRef: "",
      sampleSettings: sanitizeLoadedSampleSettings(null),
      muted: false,
      solo: false,
      volume: 1,
      pan: 0,
      inputMode: "steps",
      mixerInsertId: targetInsert?.id || "insert-1",
    });

    state.project.patterns.forEach(function (pattern) {
      if (!pattern.stepGrid) {
        pattern.stepGrid = {};
      }

      const length = Math.max(1, pattern.lengthSteps || 16);
      pattern.stepGrid[newChannelId] = makeStepRow(length, []);
    });

    state.project.activeChannelId = newChannelId;
  },

  renameChannel(state, action) {
    const channelId = String(action.payload?.channelId || "").trim();
    if (!channelId) {
      return;
    }

    const channel = state.project.channels.find(function (item) {
      return item.id === channelId;
    });
    if (!channel) {
      return;
    }

    const nextName = String(action.payload?.name || "").trim();
    if (!nextName) {
      return;
    }

    channel.name = nextName.slice(0, 14);
  },

  duplicateChannel(state, action) {
    const sourceChannelId = String(action.payload || "").trim();
    if (!sourceChannelId) {
      return;
    }

    const sourceIndex = state.project.channels.findIndex(function (channel) {
      return channel.id === sourceChannelId;
    });
    if (sourceIndex < 0) {
      return;
    }

    const sourceChannel = state.project.channels[sourceIndex];
    const newChannelId = makeChannelId();
    const baseName = String(sourceChannel.name || "Channel").trim() || "Channel";
    const duplicateName = (baseName + " Copy").slice(0, 14);

    const duplicatedChannel = {
      ...sourceChannel,
      id: newChannelId,
      name: duplicateName,
      sampleSettings:
        cloneSerializable(sourceChannel.sampleSettings) || sanitizeLoadedSampleSettings(null),
    };

    state.project.channels.splice(sourceIndex + 1, 0, duplicatedChannel);

    state.project.patterns.forEach(function (pattern) {
      if (!pattern.stepGrid) {
        pattern.stepGrid = {};
      }
      if (!pattern.pianoPreview) {
        pattern.pianoPreview = {};
      }

      const patternLength = Math.max(1, pattern.lengthSteps || 16);
      const sourceRow = Array.isArray(pattern.stepGrid[sourceChannelId])
        ? pattern.stepGrid[sourceChannelId]
        : [];
      const nextRow = sourceRow
        .slice(0, patternLength)
        .map(Boolean)
        .concat(Array(Math.max(0, patternLength - sourceRow.length)).fill(false))
        .slice(0, patternLength);
      pattern.stepGrid[newChannelId] = nextRow;

      const sourceNotes = Array.isArray(pattern.pianoPreview[sourceChannelId])
        ? pattern.pianoPreview[sourceChannelId]
        : [];
      pattern.pianoPreview[newChannelId] = sourceNotes.map(function (note) {
        const clonedNote = cloneSerializable(note) || {};
        return {
          ...clonedNote,
          id: makeMidiPatternNoteId("n-" + newChannelId),
        };
      });
    });

    state.project.activeChannelId = newChannelId;
  },

  removeChannel(state, action) {
    const channelId = String(action.payload || "").trim();
    if (!channelId) {
      return;
    }

    if (state.project.channels.length <= 1) {
      return;
    }

    const removeIndex = state.project.channels.findIndex(function (channel) {
      return channel.id === channelId;
    });
    if (removeIndex < 0) {
      return;
    }

    state.project.channels.splice(removeIndex, 1);

    state.project.patterns.forEach(function (pattern) {
      if (pattern.stepGrid && Object.hasOwn(pattern.stepGrid, channelId)) {
        delete pattern.stepGrid[channelId];
      }
      if (
        pattern.pianoPreview &&
        Object.hasOwn(pattern.pianoPreview, channelId)
      ) {
        delete pattern.pianoPreview[channelId];
      }
    });

    state.project.playlistClips = state.project.playlistClips.filter(function (
      clip,
    ) {
      return String(clip.channelId || "").trim() !== channelId;
    });

    if (state.project.activeChannelId === channelId) {
      const fallbackIndex = Math.max(
        0,
        Math.min(removeIndex, state.project.channels.length - 1),
      );
      state.project.activeChannelId =
        state.project.channels[fallbackIndex]?.id ||
        state.project.channels[0]?.id ||
        "";
    }
  },

  setChannelInputMode(state, action) {
    const channel = state.project.channels.find(function (item) {
      return item.id === action.payload.channelId;
    });
    if (!channel) {
      return;
    }
    channel.inputMode = action.payload.mode;
  },

  setChannelMute(state, action) {
    const channel = state.project.channels.find(function (item) {
      return item.id === action.payload.channelId;
    });
    if (!channel) {
      return;
    }
    channel.muted = action.payload.value;
  },

  setChannelSolo(state, action) {
    const channel = state.project.channels.find(function (item) {
      return item.id === action.payload.channelId;
    });
    if (!channel) {
      return;
    }
    channel.solo = action.payload.value;
  },

  setChannelVolume(state, action) {
    const channel = state.project.channels.find(function (item) {
      return item.id === action.payload.channelId;
    });
    if (!channel) {
      return;
    }
    channel.volume = Math.max(0, Math.min(1, action.payload.value));
  },

  setChannelPan(state, action) {
    const channel = state.project.channels.find(function (item) {
      return item.id === action.payload.channelId;
    });
    if (!channel) {
      return;
    }
    channel.pan = Math.max(-1, Math.min(1, action.payload.value));
  },

  setChannelMixerInsert(state, action) {
    const channel = state.project.channels.find(function (item) {
      return item.id === action.payload.channelId;
    });
    if (!channel) {
      return;
    }

    const insertId = action.payload.insertId;
    const exists = state.mixer.inserts.some(function (insert) {
      return insert.id === insertId;
    });
    if (!exists) {
      return;
    }

    channel.mixerInsertId = insertId;
  },

  setChannelSampleSettings(state, action) {
    const channel = state.project.channels.find(function (item) {
      return item.id === action.payload.channelId;
    });
    if (!channel) {
      return;
    }

    if (!channel.sampleSettings) {
      channel.sampleSettings = sanitizeLoadedSampleSettings(null);
    }

    const changes = action.payload.changes || {};
    const next = channel.sampleSettings;

    if (Object.hasOwn(changes, "cutItself")) {
      next.cutItself = Boolean(changes.cutItself);
    }

    if (Object.hasOwn(changes, "normalize")) {
      next.normalize = Boolean(changes.normalize);
    }

    if (Object.hasOwn(changes, "lengthPct")) {
      next.lengthPct = Math.max(
        5,
        Math.min(100, Number(changes.lengthPct || next.lengthPct)),
      );
    }

    if (Object.hasOwn(changes, "fadeInPct")) {
      next.fadeInPct = Math.max(
        0,
        Math.min(95, Number(changes.fadeInPct ?? next.fadeInPct)),
      );
    }

    if (Object.hasOwn(changes, "fadeOutPct")) {
      next.fadeOutPct = Math.max(
        0,
        Math.min(95, Number(changes.fadeOutPct ?? next.fadeOutPct)),
      );
    }

    if (Object.hasOwn(changes, "envEnabled")) {
      next.envEnabled = Boolean(changes.envEnabled);
    }

    if (Object.hasOwn(changes, "envDelayMs")) {
      next.envDelayMs = Math.max(
        0,
        Math.min(3000, Number(changes.envDelayMs ?? next.envDelayMs ?? 0)),
      );
    }

    if (Object.hasOwn(changes, "envAttackMs")) {
      next.envAttackMs = Math.max(
        0,
        Math.min(3000, Number(changes.envAttackMs ?? next.envAttackMs ?? 0)),
      );
    }

    if (Object.hasOwn(changes, "envHoldMs")) {
      next.envHoldMs = Math.max(
        0,
        Math.min(3000, Number(changes.envHoldMs ?? next.envHoldMs ?? 0)),
      );
    }

    if (Object.hasOwn(changes, "envDecayMs")) {
      next.envDecayMs = Math.max(
        0,
        Math.min(3000, Number(changes.envDecayMs ?? next.envDecayMs ?? 0)),
      );
    }

    if (Object.hasOwn(changes, "envSustainPct")) {
      next.envSustainPct = Math.max(
        0,
        Math.min(
          100,
          Number(changes.envSustainPct ?? next.envSustainPct ?? 100),
        ),
      );
    }

    if (Object.hasOwn(changes, "envReleaseMs")) {
      next.envReleaseMs = Math.max(
        0,
        Math.min(
          3000,
          Number(changes.envReleaseMs ?? next.envReleaseMs ?? 0),
        ),
      );
    }

    if (Object.hasOwn(changes, "attackMs")) {
      next.attackMs = Math.max(
        0,
        Math.min(400, Number(changes.attackMs ?? next.attackMs ?? 8)),
      );
    }

    if (Object.hasOwn(changes, "releaseMs")) {
      next.releaseMs = Math.max(
        0,
        Math.min(1000, Number(changes.releaseMs ?? next.releaseMs ?? 420)),
      );
    }

    if (
      Object.hasOwn(changes, "pitchCents") ||
      Object.hasOwn(changes, "pitchSemitones")
    ) {
      const rawPitchCents = Object.hasOwn(changes, "pitchCents")
        ? Number(changes.pitchCents)
        : Number(changes.pitchSemitones) * 100;

      next.pitchCents = Math.max(
        -100,
        Math.min(100, Math.round(rawPitchCents ?? next.pitchCents ?? 0)),
      );
    }

    if (Object.hasOwn(changes, "monoMode")) {
      next.monoMode = Boolean(changes.monoMode);
    }

    if (Object.hasOwn(changes, "stretchMode")) {
      const requestedMode = String(changes.stretchMode || "")
        .trim()
        .toLowerCase();
      next.stretchMode = new Set(["none", "resample", "stretch", "realtime"]).has(requestedMode)
        ? requestedMode
        : next.stretchMode || "resample";
    }

    if (Object.hasOwn(changes, "stretchPitchSemitones")) {
      next.stretchPitchSemitones = Math.max(
        -24,
        Math.min(
          24,
          Number(
            changes.stretchPitchSemitones ?? next.stretchPitchSemitones ?? 0,
          ),
        ),
      );
    }

    if (Object.hasOwn(changes, "stretchMultiplier")) {
      next.stretchMultiplier = Math.max(
        0.25,
        Math.min(
          8,
          Number(changes.stretchMultiplier ?? next.stretchMultiplier ?? 1),
        ),
      );
    }

    if (Object.hasOwn(changes, "stretchSourceBpm")) {
      next.stretchSourceBpm = Math.max(
        20,
        Math.min(
          300,
          Number(changes.stretchSourceBpm ?? next.stretchSourceBpm ?? 120),
        ),
      );
    }

    if (Object.hasOwn(changes, "stretchProjectTempoBpm")) {
      next.stretchProjectTempoBpm = Math.max(
        20,
        Math.min(
          300,
          Number(
            changes.stretchProjectTempoBpm ??
              next.stretchProjectTempoBpm ??
              120,
          ),
        ),
      );
    }

    if (Object.hasOwn(changes, "stretchTimeMode")) {
      const requestedMode = String(changes.stretchTimeMode || "")
        .trim()
        .toLowerCase();
      next.stretchTimeMode = new Set([
        "none",
        "set-bpm",
        "project-tempo",
        "beat-1",
        "beat-2",
        "bar-1",
        "bar-2",
        "bar-3",
        "bar-4",
      ]).has(requestedMode)
        ? requestedMode
        : next.stretchTimeMode || "none";
    }

    // Keep fade ranges sane: combined fade cannot exceed 98 %.
    const fadeTotal = next.fadeInPct + next.fadeOutPct;
    if (fadeTotal > 98) {
      const scale = 98 / fadeTotal;
      next.fadeInPct = Math.max(0, Math.round(next.fadeInPct * scale));
      next.fadeOutPct = Math.max(0, Math.round(next.fadeOutPct * scale));
    }
  },

  assignSampleToChannel(state, action) {
    const channel = state.project.channels.find(function (item) {
      return item.id === action.payload.channelId;
    });
    if (!channel) {
      return;
    }
    const previousSampleRef = String(channel.sampleRef || "").trim();
    const nextSampleRef = String(action.payload.sampleRef || "").trim();
    if (!nextSampleRef) {
      return;
    }

    channel.sampleRef = action.payload.sampleRef;
    channel.pluginRef = "";
    const sourceName = action.payload.sampleName || action.payload.sampleRef;
    channel.name = sourceName
      .split("/")
      .pop()
      .replace(/\.[^.]+$/, "")
      .slice(0, 14);

    const nextAudioName = String(sourceName || "")
      .split("/")
      .pop()
      .trim();

    state.project.playlistClips.forEach(function (clip) {
      if (String(clip?.clipType || "").toLowerCase() !== "audio") {
        return;
      }
      if (String(clip?.channelId || "").trim() !== channel.id) {
        return;
      }

      const clipSamplePath = String(clip.samplePath || "").trim();
      const shouldSyncClipSample =
        !clipSamplePath ||
        clipSamplePath === previousSampleRef ||
        clipSamplePath === channel.sampleRef;

      if (!shouldSyncClipSample) {
        return;
      }

      clip.samplePath = nextSampleRef;
      if (nextAudioName) {
        clip.audioName = nextAudioName;
      }
    });
  },

  assignPluginToChannel(state, action) {
    const channel = state.project.channels.find(function (item) {
      return item.id === action.payload.channelId;
    });
    if (!channel) {
      return;
    }

    channel.pluginRef = String(action.payload.pluginRef || "").trim();
    channel.sampleRef = "";

    const pluginName = String(action.payload.pluginName || "Plugin").trim();
    if (pluginName) {
      channel.name = pluginName.slice(0, 14);
    }
  },

  // ----------------------------------------------------------------
  // Piano roll notes
  // ----------------------------------------------------------------

  togglePianoNote(state, action) {
    const pattern = state.project.patterns.find(function (item) {
      return item.id === action.payload.patternId;
    });
    if (!pattern) {
      return;
    }

    const channelId = action.payload.channelId;
    if (!pattern.pianoPreview) {
      pattern.pianoPreview = {};
    }
    if (!pattern.pianoPreview[channelId]) {
      pattern.pianoPreview[channelId] = [];
    }

    const patternLength = Math.max(1, pattern.lengthSteps || 16);
    const start = Math.max(
      0,
      Math.min(patternLength - 0.0625, Number(action.payload.start || 0)),
    );
    const pitch = Math.round(action.payload.pitch || 72);
    const maxLen = Math.max(0.0625, patternLength - start);
    const length = Math.max(
      0.0625,
      Math.min(maxLen, Number(action.payload.length || 1)),
    );
    const velocity = Math.max(
      1,
      Math.min(
        127,
        Math.round(Number(action.payload.velocity || 95)),
      ),
    );

    const notes = pattern.pianoPreview[channelId];
    const existingIndex = notes.findIndex(function (note) {
      return nearlyEqual(note.start || 0, start) && note.pitch === pitch;
    });

    if (existingIndex >= 0) {
      notes.splice(existingIndex, 1);
      return;
    }

    notes.push({
      id:
        action.payload.id ||
        "n-" +
          channelId +
          "-" +
          Date.now().toString(36) +
          "-" +
          Math.random().toString(36).slice(2, 7),
      start,
      length,
      pitch,
      velocity,
    });
  },

  setPianoNoteLength(state, action) {
    const pattern = state.project.patterns.find(function (item) {
      return item.id === action.payload.patternId;
    });
    if (!pattern) {
      return;
    }

    const channelId = action.payload.channelId;
    const notes = pattern.pianoPreview?.[channelId];
    if (!notes) {
      return;
    }

    const start = Number(action.payload.start || 0);
    const pitch = Math.round(action.payload.pitch || 72);
    const note =
      notes.find(function (item) {
        return item.id === action.payload.noteId;
      }) ||
      notes.find(function (item) {
        return nearlyEqual(item.start || 0, start) && item.pitch === pitch;
      });
    if (!note) {
      return;
    }

    const patternLength = Math.max(1, pattern.lengthSteps || 16);
    const maxLen = Math.max(0.0625, patternLength - note.start);
    note.length = Math.max(
      0.0625,
      Math.min(maxLen, Number(action.payload.length || note.length || 1)),
    );
  },

  setPianoNoteVelocity(state, action) {
    const pattern = state.project.patterns.find(function (item) {
      return item.id === action.payload.patternId;
    });
    if (!pattern) {
      return;
    }

    const channelId = action.payload.channelId;
    const notes = pattern.pianoPreview?.[channelId];
    if (!notes) {
      return;
    }

    const start = Number(action.payload.start || 0);
    const pitch = Math.round(action.payload.pitch || 72);
    const note =
      notes.find(function (item) {
        return item.id === action.payload.noteId;
      }) ||
      notes.find(function (item) {
        return nearlyEqual(item.start || 0, start) && item.pitch === pitch;
      });
    if (!note) {
      return;
    }

    note.velocity = Math.max(
      1,
      Math.min(
        127,
        Math.round(Number(action.payload.velocity || 95)),
      ),
    );
  },

  movePianoNote(state, action) {
    const pattern = state.project.patterns.find(function (item) {
      return item.id === action.payload.patternId;
    });
    if (!pattern) {
      return;
    }

    const channelId = action.payload.channelId;
    const notes = pattern.pianoPreview?.[channelId];
    if (!notes) {
      return;
    }

    const start = Number(action.payload.start || 0);
    const pitch = Math.round(action.payload.pitch || 72);
    const note =
      notes.find(function (item) {
        return item.id === action.payload.noteId;
      }) ||
      notes.find(function (item) {
        return nearlyEqual(item.start || 0, start) && item.pitch === pitch;
      });
    if (!note) {
      return;
    }

    const patternLength = Math.max(1, pattern.lengthSteps || 16);
    const nextStart = Math.max(
      0,
      Math.min(patternLength - 0.0625, Number(action.payload.nextStart || 0)),
    );
    const nextPitch = Math.round(action.payload.nextPitch || note.pitch);

    note.start = nextStart;
    note.pitch = nextPitch;

    const maxLen = Math.max(0.0625, patternLength - note.start);
    note.length = Math.max(
      0.0625,
      Math.min(maxLen, Number(note.length || 1)),
    );
  },

  addPianoNotesBatch(state, action) {
    const pattern = state.project.patterns.find(function (item) {
      return item.id === action.payload.patternId;
    });
    if (!pattern) {
      return;
    }

    const channelId = String(action.payload.channelId || "").trim();
    if (!channelId) {
      return;
    }

    const incomingNotes = Array.isArray(action.payload.notes)
      ? action.payload.notes
      : [];
    if (incomingNotes.length === 0) {
      return;
    }

    if (!pattern.pianoPreview) {
      pattern.pianoPreview = {};
    }
    if (!Array.isArray(pattern.pianoPreview[channelId])) {
      pattern.pianoPreview[channelId] = [];
    }

    const patternLength = Math.max(1, pattern.lengthSteps || 16);
    const notes = pattern.pianoPreview[channelId];
    const allowOverlaps = Boolean(action.payload.allowOverlaps);
    const occupied = allowOverlaps
      ? null
      : new Set(
          notes.map(function (note) {
            return Math.round((note.start || 0) * 1000) + ":" + note.pitch;
          }),
        );

    incomingNotes.forEach(function (inputNote) {
      const start = Math.max(
        0,
        Math.min(patternLength - 0.0625, Number(inputNote?.start || 0)),
      );
      const maxLen = Math.max(0.0625, patternLength - start);
      const length = Math.max(
        0.0625,
        Math.min(maxLen, Number(inputNote?.length || 1)),
      );
      const pitch = Math.max(
        0,
        Math.min(
          127,
          Math.round(Number(inputNote?.pitch || 72)),
        ),
      );
      const key = Math.round(start * 1000) + ":" + pitch;
      if (occupied?.has(key)) {
        return;
      }

      occupied?.add(key);
      notes.push({
        id:
          inputNote?.id ||
          "n-" +
            channelId +
            "-" +
            Date.now().toString(36) +
            "-" +
            Math.random().toString(36).slice(2, 7),
        start,
        length,
        pitch,
        velocity: Math.max(
          1,
          Math.min(
            127,
            Math.round(Number(inputNote?.velocity || 95)),
          ),
        ),
      });
    });

    notes.sort(function (a, b) {
      if (a.start !== b.start) {
        return a.start - b.start;
      }

      return b.pitch - a.pitch;
    });
  },

  movePianoNotesBatch(state, action) {
    const pattern = state.project.patterns.find(function (item) {
      return item.id === action.payload.patternId;
    });
    if (!pattern) {
      return;
    }

    const channelId = String(action.payload.channelId || "").trim();
    const notes = pattern.pianoPreview?.[channelId];
    if (!notes) {
      return;
    }

    const moves = Array.isArray(action.payload.moves)
      ? action.payload.moves
      : [];
    if (moves.length === 0) {
      return;
    }

    const patternLength = Math.max(1, pattern.lengthSteps || 16);

    moves.forEach(function (move) {
      const start = Number(move?.start || 0);
      const pitch = Math.round(Number(move?.pitch || 72));
      const note =
        notes.find(function (item) {
          return item.id === move?.noteId;
        }) ||
        notes.find(function (item) {
          return nearlyEqual(item.start || 0, start) && item.pitch === pitch;
        });
      if (!note) {
        return;
      }

      const nextStart = Math.max(
        0,
        Math.min(patternLength - 0.0625, Number(move?.nextStart || 0)),
      );
      const nextPitch = Math.round(Number(move?.nextPitch || note.pitch));

      note.start = nextStart;
      note.pitch = nextPitch;

      const maxLen = Math.max(0.0625, patternLength - note.start);
      note.length = Math.max(
        0.0625,
        Math.min(maxLen, Number(note.length || 1)),
      );
    });

    notes.sort(function (a, b) {
      if (a.start !== b.start) {
        return a.start - b.start;
      }

      return b.pitch - a.pitch;
    });
  },

  removePianoNotesBatch(state, action) {
    const pattern = state.project.patterns.find(function (item) {
      return item.id === action.payload.patternId;
    });
    if (!pattern) {
      return;
    }

    const channelId = String(action.payload.channelId || "").trim();
    if (!channelId) {
      return;
    }

    const removals = Array.isArray(action.payload.notes)
      ? action.payload.notes
      : [];
    if (removals.length === 0) {
      return;
    }

    const notesToRemove = removals.filter(function (item) {
      return String(item?.source || "piano").toLowerCase() !== "step";
    });
    const stepsToRemove = removals.filter(function (item) {
      return String(item?.source || "piano").toLowerCase() === "step";
    });

    if (stepsToRemove.length > 0) {
      if (!pattern.stepGrid) {
        pattern.stepGrid = {};
      }
      if (!Array.isArray(pattern.stepGrid[channelId])) {
        const patternLength = Math.max(1, Number(pattern.lengthSteps || 16));
        pattern.stepGrid[channelId] = makeStepRow(patternLength, []);
      }

      const row = pattern.stepGrid[channelId];
      stepsToRemove.forEach(function (stepItem) {
        const stepIndex = Math.max(
          0,
          Math.round(Number(stepItem.start || 0)),
        );
        if (stepIndex < row.length) {
          row[stepIndex] = false;
        }
      });
    }

    if (notesToRemove.length > 0) {
      const existing = pattern.pianoPreview?.[channelId];
      if (!Array.isArray(existing) || existing.length === 0) {
        return;
      }

      const byId = new Set(
        notesToRemove
          .map(function (item) {
            return String(item?.id || "").trim();
          })
          .filter(Boolean),
      );

      pattern.pianoPreview[channelId] = existing.filter(function (note) {
        if (byId.has(String(note.id || "").trim())) {
          return false;
        }

        const removeByStartPitch = notesToRemove.some(function (item) {
          return (
            nearlyEqual(Number(item.start || 0), Number(note.start || 0)) &&
            Math.round(Number(item.pitch || 72)) ===
              Math.round(Number(note.pitch || 72))
          );
        });

        return !removeByStartPitch;
      });
    }
  },

  pasteMidiPatternToChannel(state, action) {
    const pattern = state.project.patterns.find(function (item) {
      return item.id === action.payload.patternId;
    });
    if (!pattern) {
      return;
    }

    const channelId = String(action.payload.channelId || "").trim();
    if (!channelId) {
      return;
    }

    const channelExists = state.project.channels.some(function (channel) {
      return channel.id === channelId;
    });
    if (!channelExists) {
      return;
    }

    const incomingNotes = Array.isArray(action.payload.notes)
      ? action.payload.notes
      : [];
    if (incomingNotes.length === 0) {
      return;
    }

    const patternLength = Math.max(1, Number(pattern.lengthSteps || 16));

    if (!pattern.stepGrid) {
      pattern.stepGrid = {};
    }

    if (!Array.isArray(pattern.stepGrid[channelId])) {
      pattern.stepGrid[channelId] = makeStepRow(patternLength, []);
    }

    if (pattern.stepGrid[channelId].length < patternLength) {
      pattern.stepGrid[channelId].push(
        ...Array(patternLength - pattern.stepGrid[channelId].length).fill(
          false,
        ),
      );
    }

    if (!pattern.pianoPreview) {
      pattern.pianoPreview = {};
    }

    if (!Array.isArray(pattern.pianoPreview[channelId])) {
      pattern.pianoPreview[channelId] = [];
    }

    const stepRow = pattern.stepGrid[channelId];
    for (let i = 0; i < patternLength; i += 1) {
      stepRow[i] = false;
    }

    pattern.pianoPreview[channelId] = [];
    const pianoNotes = pattern.pianoPreview[channelId];

    const normalizedNotes = incomingNotes
      .map(function (note) {
        const start = Math.max(
          0,
          Math.min(patternLength - 0.0625, Number(note?.start || 0)),
        );
        const maxLen = Math.max(0.0625, patternLength - start);
        const length = Math.max(
          0.0625,
          Math.min(maxLen, Number(note?.length || 1)),
        );
        const pitch = Math.max(
          0,
          Math.min(
            127,
            Math.round(Number(note?.pitch || 72)),
          ),
        );
        const velocity = Math.max(
          1,
          Math.min(
            127,
            Math.round(Number(note?.velocity || 95)),
          ),
        );
        const source = String(note?.source || "piano").toLowerCase();

        return {
          start,
          length,
          pitch,
          velocity,
          source: source === "step" ? "step" : "piano",
        };
      })
      .filter(Boolean);

    if (normalizedNotes.length === 0) {
      return;
    }

    normalizedNotes.forEach(function (note) {
      const maxLen = Math.max(0.0625, patternLength - note.start);
      const shiftedLength = Math.max(0.0625, Math.min(maxLen, note.length));

      const isStepCandidate =
        note.source === "step" &&
        note.pitch === 72 &&
        nearlyEqual(shiftedLength, 1) &&
        nearlyEqual(note.start, Math.round(note.start));

      if (isStepCandidate) {
        const stepIndex = Math.round(note.start);
        if (stepIndex >= 0 && stepIndex < patternLength) {
          stepRow[stepIndex] = true;
        }
        return;
      }

      pianoNotes.push({
        id: makeMidiPatternNoteId("midi"),
        start: note.start,
        length: shiftedLength,
        pitch: note.pitch,
        velocity: note.velocity,
      });
    });

    pianoNotes.sort(function (a, b) {
      if (a.start !== b.start) {
        return a.start - b.start;
      }
      return b.pitch - a.pitch;
    });
  },
};

// ------------------------------------------------------------------
// Playlist clip sorting helper
// ------------------------------------------------------------------

function sortPlaylistClips(playlistClips, playlistTracks) {
  const trackOrderById = playlistTracks.reduce(function (acc, track, index) {
    acc[track.id] = index;
    return acc;
  }, {});

  playlistClips.sort(function (a, b) {
    const trackDelta =
      (trackOrderById[a.trackId] ?? 999) -
      (trackOrderById[b.trackId] ?? 999);
    if (trackDelta !== 0) {
      return trackDelta;
    }

    return a.barStart - b.barStart;
  });
}
