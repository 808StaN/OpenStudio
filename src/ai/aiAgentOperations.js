import {
  addChannel,
  addMixerTrack,
  addPianoNotesBatch,
  addPlaylistAudioClip,
  addPlaylistPatternClip,
  addPlaylistSampleAsChannel,
  assignSampleToChannel,
  createPattern,
  renameChannel,
  renamePattern,
  setActivePattern,
  setChannelInputMode,
  setChannelMixerInsert,
  setChannelMute,
  setChannelPan,
  setChannelSolo,
  setChannelVolume,
  setFxSlotEffectType,
  setFxSlotGraphicEqBandGain,
  setFxSlotMaximizerParam,
  setFxSlotReverbParam,
  setInsertFader,
  setInsertPan,
  setInsertStereo,
  setPatternLength,
  toggleFxSlot,
  toggleStep,
} from "../store";
import { AI_AGENT_OPERATION_TYPES } from "./aiAgentPrompt";

const ALLOWED_OPERATION_TYPES = new Set(AI_AGENT_OPERATION_TYPES);

function getDawState(rootOrDawState) {
  return rootOrDawState?.daw || rootOrDawState || {};
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, numeric));
}

function asString(value) {
  return String(value || "").trim();
}

function getActivePatternId(dawState) {
  return asString(dawState?.project?.activePatternId);
}

function getActiveChannelId(dawState) {
  return asString(dawState?.project?.activeChannelId);
}

function resolvePatternId(dawState, payload = {}) {
  const requested = asString(payload.patternId);
  if (!requested || requested === "$active") {
    return getActivePatternId(dawState);
  }
  return requested;
}

function resolveChannelId(dawState, payload = {}) {
  const requestedId = asString(payload.channelId);
  if (!requestedId || requestedId === "$active") {
    return getActiveChannelId(dawState);
  }

  const channels = Array.isArray(dawState?.project?.channels)
    ? dawState.project.channels
    : [];
  const direct = channels.find(function (channel) {
    return channel.id === requestedId;
  });
  if (direct) {
    return direct.id;
  }

  const requestedName = asString(payload.channelName || requestedId).toLowerCase();
  const byName = channels.find(function (channel) {
    return asString(channel.name).toLowerCase() === requestedName;
  });
  return byName?.id || requestedId;
}

function resolveTrackId(dawState, payload = {}) {
  const requested = asString(payload.trackId);
  if (requested) {
    return requested;
  }

  const tracks = Array.isArray(dawState?.project?.playlistTracks)
    ? dawState.project.playlistTracks
    : [];
  return tracks[0]?.id || "trk-1";
}

function getOperationDescription(operation) {
  const payload = operation.payload || {};

  switch (operation.type) {
    case "create_pattern":
      return "Create pattern" + (payload.name ? " " + payload.name : "");
    case "set_active_pattern":
      return "Set active pattern to " + (payload.patternId || "$active");
    case "rename_pattern":
      return "Rename pattern to " + (payload.name || "Untitled");
    case "set_pattern_length":
      return "Set pattern length to " + (payload.lengthSteps || payload.length || 16) + " steps";
    case "add_channel":
      return "Add channel" + (payload.name ? " " + payload.name : "");
    case "assign_sample_to_channel":
      return "Assign sample to channel " + (payload.channelName || payload.channelId || "$active");
    case "add_sample_as_channel":
      return "Add sample as a new channel";
    case "set_step":
      return "Set sequencer step " + Number(payload.stepIndex || 0);
    case "add_piano_notes":
      return "Add " + (Array.isArray(payload.notes) ? payload.notes.length : 0) + " piano notes";
    case "set_channel_volume":
      return "Set channel volume for " + (payload.channelName || payload.channelId || "$active");
    case "set_channel_pan":
      return "Set channel pan for " + (payload.channelName || payload.channelId || "$active");
    case "set_channel_mute":
      return "Set channel mute for " + (payload.channelName || payload.channelId || "$active");
    case "set_channel_solo":
      return "Set channel solo for " + (payload.channelName || payload.channelId || "$active");
    case "set_channel_input_mode":
      return "Set channel input mode for " + (payload.channelName || payload.channelId || "$active");
    case "set_channel_mixer_insert":
      return "Route channel to mixer insert " + (payload.insertId || "insert-1");
    case "add_playlist_pattern_clip":
      return "Add pattern clip to playlist";
    case "add_playlist_audio_clip":
      return "Add audio clip to playlist";
    case "add_mixer_track":
      return "Add mixer track";
    case "set_insert_fader":
      return "Set mixer fader for " + (payload.insertId || "insert-1");
    case "set_insert_pan":
      return "Set mixer pan for " + (payload.insertId || "insert-1");
    case "set_insert_stereo":
      return "Set mixer stereo separation for " + (payload.insertId || "insert-1");
    case "set_fx_slot_effect":
      return "Set FX slot " + (payload.slotId || "slot-1") + " on " + (payload.insertId || "insert-1");
    case "set_fx_reverb_param":
      return "Set reverb parameter " + (payload.param || "value");
    case "set_fx_maximizer_param":
      return "Set maximizer parameter " + (payload.param || "value");
    case "set_fx_graphic_eq_band_gain":
      return "Set graphic EQ band gain";
    default:
      return "Unknown operation";
  }
}

export function prepareAiOperations(rawOperations) {
  const sourceOperations = Array.isArray(rawOperations) ? rawOperations : [];
  const operations = [];
  const rejected = [];

  sourceOperations.forEach(function (rawOperation, index) {
    const type = asString(rawOperation?.type);
    const payload = rawOperation?.payload && typeof rawOperation.payload === "object"
      ? rawOperation.payload
      : {};

    if (!ALLOWED_OPERATION_TYPES.has(type)) {
      rejected.push({
        index,
        reason: "Unsupported operation type: " + (type || "empty"),
      });
      return;
    }

    const operation = {
      id: "ai-op-" + index + "-" + type,
      type,
      payload,
    };

    operations.push({
      ...operation,
      description: getOperationDescription(operation),
    });
  });

  return { operations, rejected };
}

function applyCreatePattern(operation, dispatch, getState) {
  const payload = operation.payload || {};
  dispatch(createPattern({ lengthSteps: payload.lengthSteps || payload.length }));

  const nextState = getDawState(getState());
  const newPatternId = getActivePatternId(nextState);
  const name = asString(payload.name);
  if (newPatternId && name) {
    dispatch(renamePattern({ patternId: newPatternId, name }));
  }
}

function applyAddChannel(operation, dispatch, getState) {
  const payload = operation.payload || {};
  dispatch(addChannel());

  const nextState = getDawState(getState());
  const newChannelId = getActiveChannelId(nextState);
  const name = asString(payload.name);
  if (newChannelId && name) {
    dispatch(renameChannel({ channelId: newChannelId, name }));
  }
}

function applySetStep(operation, dispatch, getState) {
  const dawState = getDawState(getState());
  const payload = operation.payload || {};
  const patternId = resolvePatternId(dawState, payload);
  const channelId = resolveChannelId(dawState, payload);
  const pattern = (dawState.project?.patterns || []).find(function (item) {
    return item.id === patternId;
  });
  const stepIndex = Math.round(clampNumber(payload.stepIndex, 0, 127, 0));
  const desiredValue = payload.value !== false;
  const currentValue = Boolean(pattern?.stepGrid?.[channelId]?.[stepIndex]);

  if (currentValue !== desiredValue) {
    dispatch(toggleStep({ patternId, channelId, stepIndex }));
  }
}

function applyAiOperation(operation, dispatch, getState) {
  const dawState = getDawState(getState());
  const payload = operation.payload || {};

  if (operation.type === "create_pattern") {
    applyCreatePattern(operation, dispatch, getState);
    return true;
  }

  if (operation.type === "set_active_pattern") {
    dispatch(setActivePattern(resolvePatternId(dawState, payload)));
    return true;
  }

  if (operation.type === "rename_pattern") {
    dispatch(renamePattern({
      patternId: resolvePatternId(dawState, payload),
      name: payload.name,
    }));
    return true;
  }

  if (operation.type === "set_pattern_length") {
    dispatch(setPatternLength({
      patternId: resolvePatternId(dawState, payload),
      length: payload.lengthSteps || payload.length,
    }));
    return true;
  }

  if (operation.type === "add_channel") {
    applyAddChannel(operation, dispatch, getState);
    return true;
  }

  if (operation.type === "assign_sample_to_channel") {
    dispatch(assignSampleToChannel({
      channelId: resolveChannelId(dawState, payload),
      sampleRef: payload.samplePath || payload.sampleRef,
      sampleName: payload.sampleName || payload.clipName,
    }));
    return true;
  }

  if (operation.type === "add_sample_as_channel") {
    dispatch(addPlaylistSampleAsChannel({
      samplePath: payload.samplePath || payload.sampleRef,
      clipName: payload.clipName || payload.sampleName,
      trackId: resolveTrackId(dawState, payload),
      barStart: payload.barStart,
      barLength: payload.barLength,
    }));
    return true;
  }

  if (operation.type === "set_step") {
    applySetStep(operation, dispatch, getState);
    return true;
  }

  if (operation.type === "add_piano_notes") {
    dispatch(addPianoNotesBatch({
      patternId: resolvePatternId(dawState, payload),
      channelId: resolveChannelId(dawState, payload),
      notes: Array.isArray(payload.notes) ? payload.notes : [],
      allowOverlaps: Boolean(payload.allowOverlaps),
    }));
    return true;
  }

  if (operation.type === "set_channel_volume") {
    dispatch(setChannelVolume({
      channelId: resolveChannelId(dawState, payload),
      value: clampNumber(payload.value, 0, 1, 1),
    }));
    return true;
  }

  if (operation.type === "set_channel_pan") {
    dispatch(setChannelPan({
      channelId: resolveChannelId(dawState, payload),
      value: clampNumber(payload.value, -1, 1, 0),
    }));
    return true;
  }

  if (operation.type === "set_channel_mute") {
    dispatch(setChannelMute({
      channelId: resolveChannelId(dawState, payload),
      value: Boolean(payload.value),
    }));
    return true;
  }

  if (operation.type === "set_channel_solo") {
    dispatch(setChannelSolo({
      channelId: resolveChannelId(dawState, payload),
      value: Boolean(payload.value),
    }));
    return true;
  }

  if (operation.type === "set_channel_input_mode") {
    dispatch(setChannelInputMode({
      channelId: resolveChannelId(dawState, payload),
      mode: payload.mode === "piano" ? "piano" : "steps",
    }));
    return true;
  }

  if (operation.type === "set_channel_mixer_insert") {
    dispatch(setChannelMixerInsert({
      channelId: resolveChannelId(dawState, payload),
      insertId: payload.insertId,
    }));
    return true;
  }

  if (operation.type === "add_playlist_pattern_clip") {
    dispatch(addPlaylistPatternClip({
      patternId: resolvePatternId(dawState, payload),
      trackId: resolveTrackId(dawState, payload),
      barStart: payload.barStart,
      barLength: payload.barLength,
    }));
    return true;
  }

  if (operation.type === "add_playlist_audio_clip") {
    dispatch(addPlaylistAudioClip({
      samplePath: payload.samplePath || payload.sampleRef,
      clipName: payload.clipName || payload.sampleName,
      channelId: payload.channelId ? resolveChannelId(dawState, payload) : undefined,
      trackId: resolveTrackId(dawState, payload),
      barStart: payload.barStart,
      barLength: payload.barLength,
      sourceOffsetSteps: payload.sourceOffsetSteps,
    }));
    return true;
  }

  if (operation.type === "add_mixer_track") {
    dispatch(addMixerTrack());
    return true;
  }

  if (operation.type === "set_insert_fader") {
    dispatch(setInsertFader({ insertId: payload.insertId, value: payload.value }));
    return true;
  }

  if (operation.type === "set_insert_pan") {
    dispatch(setInsertPan({ insertId: payload.insertId, value: payload.value }));
    return true;
  }

  if (operation.type === "set_insert_stereo") {
    dispatch(setInsertStereo({ insertId: payload.insertId, value: payload.value }));
    return true;
  }

  if (operation.type === "set_fx_slot_effect") {
    const effectType = asString(payload.effectType || "none");
    const slotId = payload.slotId || "slot-1";
    dispatch(setFxSlotEffectType({
      insertId: payload.insertId,
      slotId,
      effectType,
    }));

    const updatedState = getDawState(getState());
    const insert = (updatedState.mixer?.inserts || []).find(function (item) {
      return item.id === payload.insertId;
    });
    const slot = (insert?.fxSlots || []).find(function (item) {
      return item.id === slotId;
    });
    const desiredEnabled = effectType !== "none" && payload.enabled !== false;

    if (Boolean(slot?.enabled) !== desiredEnabled) {
      dispatch(toggleFxSlot({
        insertId: payload.insertId,
        slotId,
      }));
    }
    return true;
  }

  if (operation.type === "set_fx_reverb_param") {
    dispatch(setFxSlotReverbParam({
      insertId: payload.insertId,
      slotId: payload.slotId || "slot-1",
      param: payload.param,
      value: payload.value,
    }));
    return true;
  }

  if (operation.type === "set_fx_maximizer_param") {
    dispatch(setFxSlotMaximizerParam({
      insertId: payload.insertId,
      slotId: payload.slotId || "slot-1",
      param: payload.param,
      value: payload.value,
    }));
    return true;
  }

  if (operation.type === "set_fx_graphic_eq_band_gain") {
    dispatch(setFxSlotGraphicEqBandGain({
      insertId: payload.insertId,
      slotId: payload.slotId || "slot-1",
      bandIndex: payload.bandIndex,
      gainDb: payload.gainDb,
    }));
    return true;
  }

  return false;
}

export function applyAiOperations(operations, { dispatch, getState }) {
  const applied = [];
  const skipped = [];

  (Array.isArray(operations) ? operations : []).forEach(function (operation) {
    try {
      const wasApplied = applyAiOperation(operation, dispatch, getState);
      if (wasApplied) {
        applied.push(operation.description || operation.type);
      } else {
        skipped.push(operation.description || operation.type);
      }
    } catch (error) {
      skipped.push(
        (operation.description || operation.type) + ": " + String(error?.message || error),
      );
    }
  });

  return { applied, skipped };
}
