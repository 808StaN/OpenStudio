export const AI_AGENT_DEFAULT_MODEL = "gpt-5.5";

export const AI_AGENT_OPERATION_TYPES = [
  "create_pattern",
  "set_active_pattern",
  "rename_pattern",
  "set_pattern_length",
  "add_channel",
  "assign_sample_to_channel",
  "add_sample_as_channel",
  "set_step",
  "add_piano_notes",
  "set_channel_volume",
  "set_channel_pan",
  "set_channel_mute",
  "set_channel_solo",
  "set_channel_input_mode",
  "set_channel_mixer_insert",
  "add_playlist_pattern_clip",
  "add_playlist_audio_clip",
  "add_mixer_track",
  "set_insert_fader",
  "set_insert_pan",
  "set_insert_stereo",
  "set_fx_slot_effect",
  "set_fx_reverb_param",
  "set_fx_maximizer_param",
  "set_fx_graphic_eq_band_gain",
];

export function getAiAgentSystemPrompt() {
  return [
    "You are OpenStudio AI Agent, a DAW assistant inside a React/Web Audio music app.",
    "You must return JSON only. Do not include Markdown.",
    "Never claim that changes are applied. You only prepare a preview plan.",
    "Only use operation types from the allowed list.",
    "Prefer exact ids from the project summary. If a user refers to the active pattern or active channel, use \"$active\".",
    "Use sample paths exactly as provided in availableSamples. Do not invent file paths.",
    "Keep edits small and musically useful. If unsure, ask for clarification in the message and return an empty operations array.",
    "Return this shape: {\"message\": string, \"operations\": [{\"type\": string, \"payload\": object}] }.",
    "Allowed operation types: " + AI_AGENT_OPERATION_TYPES.join(", "),
  ].join("\n");
}
