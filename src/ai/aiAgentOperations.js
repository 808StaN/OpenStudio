import {
  addChannel,
  addMixerTrack,
  addPianoNotesBatch,
  addPlaylistAudioClip,
  addPlaylistPatternClip,
  addPlaylistSampleAsChannel,
  assignSampleToChannel,
  assignPluginToChannel,
  beginAiOperationBatch,
  createPattern,
  endAiOperationBatch,
  setBpm,
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
import { PLUGIN_EFFECTS } from "../data/pluginEffects";
import { PLUGIN_INSTRUMENTS } from "../data/pluginInstruments";
import { AI_AGENT_OPERATION_TYPES } from "./aiAgentPrompt";

const ALLOWED_OPERATION_TYPES = new Set(AI_AGENT_OPERATION_TYPES);
const DEFAULT_AI_NOTE_VELOCITY = 95;
const DEFAULT_AI_NOTE_LENGTH = 1;
const DEFAULT_AI_CHORD_LENGTH = 16;
const MIN_AI_CHORD_LENGTH = 4;
const PLUGIN_INSTRUMENT_BY_REF = PLUGIN_INSTRUMENTS.reduce(function (acc, instrument) {
  acc[instrument.pluginRef] = instrument;
  return acc;
}, {});
const PLUGIN_EFFECT_TYPES = new Set(PLUGIN_EFFECTS.map(function (effect) {
  return effect.effectType;
}));

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
  const channels = Array.isArray(dawState?.project?.channels)
    ? dawState.project.channels
    : [];

  // "$new" refers to the channel just created by add_channel in the same
  // batch. addChannel() sets the new channel as active, so $new === $active.
  if (requestedId && requestedId !== "$active" && requestedId !== "$new") {
    const direct = channels.find(function (channel) {
      return channel.id === requestedId;
    });
    if (direct) {
      return direct.id;
    }
  }

  const explicitName = asString(payload.channelName).toLowerCase();
  if (explicitName) {
    const byExplicitName = channels.find(function (channel) {
      return asString(channel.name).toLowerCase() === explicitName;
    });
    if (byExplicitName) {
      return byExplicitName.id;
    }
  }

  if (!requestedId || requestedId === "$active" || requestedId === "$new") {
    return getActiveChannelId(dawState);
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
    case "set_bpm":
      return "Set project BPM to " + (payload.bpm || payload.value || 140);
    case "set_active_pattern":
      return "Set active pattern to " + (payload.patternId || "$active");
    case "rename_pattern":
      return "Rename pattern to " + (payload.name || "Untitled");
    case "set_pattern_length":
      return "Set pattern length to " + (payload.lengthSteps || payload.length || 16) + " steps";
    case "add_channel":
      return "Add channel" + (payload.name ? " " + payload.name : "");
    case "assign_plugin_to_channel":
      return "Assign instrument " + (payload.pluginName || payload.pluginRef || "Plugin") + " to channel " + (payload.channelName || payload.channelId || "$active");
    case "assign_sample_to_channel":
      return "Assign sample to channel " + (payload.channelName || payload.channelId || "$active");
    case "add_sample_as_channel":
      return "Add sample as a new channel";
    case "set_step":
      return "Set sequencer step " + Number(payload.stepIndex || 0);
    case "add_piano_notes":
      return "Add " + (Array.isArray(payload.notes) ? payload.notes.length : 0) + " piano notes";
    case "add_chord_progression":
      return "Add " + (Array.isArray(payload.chords) ? payload.chords.length : 0) + " chord progression blocks";
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

function getExistingIds(dawState, key) {
  const source = key === "patterns"
    ? dawState?.project?.patterns
    : key === "channels"
      ? dawState?.project?.channels
      : key === "tracks"
        ? dawState?.project?.playlistTracks
        : dawState?.mixer?.inserts;

  return new Set((Array.isArray(source) ? source : []).map(function (item) {
    return String(item?.id || "").trim();
  }).filter(Boolean));
}

function validateAiOperation(operation, dawState, availableSamples = []) {
  const payload = operation.payload || {};
  const issues = [];
  const channels = Array.isArray(dawState?.project?.channels)
    ? dawState.project.channels
    : [];
  const patternIds = getExistingIds(dawState, "patterns");
  const channelIds = new Set(channels.map(function (item) {
    return String(item?.id || "").trim();
  }).filter(Boolean));
  const trackIds = getExistingIds(dawState, "tracks");
  const insertIds = getExistingIds(dawState, "inserts");
  const samplePaths = new Set(
    (Array.isArray(availableSamples) ? availableSamples : []).map(function (sample) {
      return asString(sample?.path);
    }).filter(Boolean),
  );

  const patternId = asString(payload.patternId);
  if (
    patternId &&
    patternId !== "$active" &&
    !patternIds.has(patternId) &&
    operation.type !== "create_pattern"
  ) {
    issues.push("Pattern id does not exist yet: " + patternId);
  }

  const channelId = asString(payload.channelId);
  if (
    channelId &&
    channelId !== "$active" &&
    channelId !== "$new" &&
    !channelIds.has(channelId) &&
    operation.type !== "add_channel" &&
    operation.type !== "add_sample_as_channel"
  ) {
    issues.push("Channel id does not exist yet: " + channelId);
  }

  const trackId = asString(payload.trackId);
  if (trackId && !trackIds.has(trackId)) {
    issues.push("Playlist track id does not exist: " + trackId);
  }

  const insertId = asString(payload.insertId);
  if (insertId && !insertIds.has(insertId)) {
    issues.push("Mixer insert id does not exist: " + insertId);
  }

  const samplePath = asString(payload.samplePath || payload.sampleRef);
  if (
    samplePath &&
    samplePaths.size > 0 &&
    !samplePaths.has(samplePath)
  ) {
    issues.push("Sample path was not found in the current Browser index.");
  }

  if (
    (operation.type === "assign_sample_to_channel" ||
      operation.type === "add_sample_as_channel" ||
      operation.type === "add_playlist_audio_clip") &&
    !samplePath
  ) {
    issues.push("Missing samplePath.");
  }

  if (operation.type === "set_fx_slot_effect") {
    const effectType = asString(payload.effectType || "none");
    if (effectType !== "none" && !PLUGIN_EFFECT_TYPES.has(effectType)) {
      issues.push("Unsupported effectType: " + effectType);
    }
  }

  if (operation.type === "assign_plugin_to_channel") {
    const pluginRef = asString(payload.pluginRef);
    if (!pluginRef) {
      issues.push("Missing pluginRef.");
    } else if (!PLUGIN_INSTRUMENT_BY_REF[pluginRef]) {
      issues.push("Unknown instrument pluginRef: " + pluginRef);
    }
  }

  // Warn when notes are added to a channel that has no instrument or sample
  // assigned — the notes will be silent.
  if (
    operation.type === "add_piano_notes" ||
    operation.type === "add_chord_progression"
  ) {
    const targetChannelId = resolveChannelId(dawState, payload);
    const targetChannel = (channels || []).find(function (item) {
      return item.id === targetChannelId;
    });
    if (
      targetChannel &&
      !asString(targetChannel.pluginRef) &&
      !asString(targetChannel.sampleRef)
    ) {
      issues.push(
        "Channel " + targetChannelId + " has no instrument assigned. Use assign_plugin_to_channel first.",
      );
    }
  }

  if (operation.type === "add_chord_progression") {
    const chords = Array.isArray(payload.chords) ? payload.chords : [];
    if (chords.length === 0) {
      issues.push("Missing chords.");
    }

    chords.forEach(function (chord, index) {
      const pitches = Array.isArray(chord?.pitches) ? chord.pitches : [];
      if (pitches.length < 2) {
        issues.push("Chord " + (index + 1) + " must contain at least 2 pitches.");
      }
    });
  }

  return issues;
}

export function validatePreparedAiOperations(
  operations,
  { dawState, availableSamples } = {},
) {
  return (Array.isArray(operations) ? operations : []).map(function (operation) {
    const issues = validateAiOperation(operation, dawState || {}, availableSamples);
    return {
      ...operation,
      issues,
      status: issues.length > 0 ? "warning" : "ready",
    };
  });
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

  // Auto-assign instrument if pluginRef is provided and valid, so the
  // agent can skip a separate assign_plugin_to_channel step.
  const pluginRef = asString(payload.pluginRef);
  if (newChannelId && pluginRef && PLUGIN_INSTRUMENT_BY_REF[pluginRef]) {
    const plugin = PLUGIN_INSTRUMENT_BY_REF[pluginRef];
    dispatch(assignPluginToChannel({
      channelId: newChannelId,
      pluginRef,
      pluginName: plugin.name,
    }));
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

function normalizeAiVelocity(rawVelocity) {
  const numeric = Number(rawVelocity);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return DEFAULT_AI_NOTE_VELOCITY;
  }

  if (numeric <= 1) {
    return Math.max(1, Math.min(127, Math.round(numeric * 127)));
  }

  return Math.max(1, Math.min(127, Math.round(numeric)));
}

function normalizeAiPitch(rawPitch) {
  return Math.max(0, Math.min(127, Math.round(Number(rawPitch || 72))));
}

function normalizeAiNoteLength(rawLength, fallbackLength, maxLength) {
  const numeric = Number(rawLength);
  const fallback = Number.isFinite(Number(fallbackLength))
    ? Number(fallbackLength)
    : DEFAULT_AI_NOTE_LENGTH;
  const nextLength = Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
  return Math.max(0.0625, Math.min(Math.max(0.0625, maxLength), nextLength));
}

function getPatternLength(dawState, patternId) {
  const pattern = (dawState.project?.patterns || []).find(function (item) {
    return item.id === patternId;
  });
  return Math.max(1, Number(pattern?.lengthSteps || 16));
}

function normalizeAiPianoNotes(rawNotes, patternLength, fallbackLength = DEFAULT_AI_NOTE_LENGTH) {
  return (Array.isArray(rawNotes) ? rawNotes : []).map(function (note) {
    const start = Math.max(
      0,
      Math.min(patternLength - 0.0625, Number(note?.start || 0)),
    );
    const maxLength = Math.max(0.0625, patternLength - start);
    return {
      ...note,
      start,
      length: normalizeAiNoteLength(note?.length, fallbackLength, maxLength),
      pitch: normalizeAiPitch(note?.pitch),
      velocity: normalizeAiVelocity(note?.velocity),
    };
  });
}

function normalizeAiChordProgression(chords, patternLength) {
  const notes = [];

  (Array.isArray(chords) ? chords : []).forEach(function (chord, chordIndex) {
    const pitches = Array.isArray(chord?.pitches) ? chord.pitches : [];
    if (pitches.length < 2) {
      return;
    }

    const start = Math.max(
      0,
      Math.min(patternLength - 0.0625, Number(chord?.start || 0)),
    );
    const maxLength = Math.max(0.0625, patternLength - start);
    const length = Math.max(
      MIN_AI_CHORD_LENGTH,
      normalizeAiNoteLength(chord?.length, DEFAULT_AI_CHORD_LENGTH, maxLength),
    );
    const safeLength = Math.min(length, maxLength);
    const velocity = normalizeAiVelocity(chord?.velocity);

    pitches.forEach(function (pitch, pitchIndex) {
      notes.push({
        id: "ai-chord-" + chordIndex + "-" + pitchIndex,
        start,
        length: safeLength,
        pitch: normalizeAiPitch(pitch),
        velocity,
      });
    });
  });

  return notes;
}

function applyAiOperation(operation, dispatch, getState) {
  const dawState = getDawState(getState());
  const payload = operation.payload || {};

  if (operation.type === "create_pattern") {
    applyCreatePattern(operation, dispatch, getState);
    return true;
  }

  if (operation.type === "set_bpm") {
    dispatch(setBpm(payload.bpm || payload.value));
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

  if (operation.type === "assign_plugin_to_channel") {
    const pluginRef = asString(payload.pluginRef);
    const plugin = PLUGIN_INSTRUMENT_BY_REF[pluginRef];
    dispatch(assignPluginToChannel({
      channelId: resolveChannelId(dawState, payload),
      pluginRef,
      pluginName: payload.pluginName || plugin?.name,
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
    const patternId = resolvePatternId(dawState, payload);
    const patternLength = getPatternLength(dawState, patternId);
    dispatch(addPianoNotesBatch({
      patternId,
      channelId: resolveChannelId(dawState, payload),
      notes: normalizeAiPianoNotes(payload.notes, patternLength),
      allowOverlaps: Boolean(payload.allowOverlaps),
    }));
    return true;
  }

  if (operation.type === "add_chord_progression") {
    const patternId = resolvePatternId(dawState, payload);
    const patternLength = getPatternLength(dawState, patternId);
    dispatch(addPianoNotesBatch({
      patternId,
      channelId: resolveChannelId(dawState, payload),
      notes: normalizeAiChordProgression(payload.chords, patternLength),
      allowOverlaps: true,
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
  const results = [];

  dispatch(beginAiOperationBatch());

  try {
    (Array.isArray(operations) ? operations : []).forEach(function (operation) {
      try {
        const wasApplied = applyAiOperation(operation, dispatch, getState);
        results.push({
          id: operation.id,
          description: operation.description || operation.type,
          status: wasApplied ? "applied" : "skipped",
        });
      } catch (error) {
        results.push({
          id: operation.id,
          description: operation.description || operation.type,
          status: "failed",
          reason: String(error?.message || error),
        });
      }
    });
  } finally {
    dispatch(endAiOperationBatch());
  }

  const applied = results.filter(function (result) {
    return result.status === "applied";
  });
  const skipped = results.filter(function (result) {
    return result.status !== "applied";
  });

  return { applied, skipped, results };
}
