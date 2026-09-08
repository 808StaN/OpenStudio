export type AiProviderId = "openai" | "gemini"

export type AiChatRole = "user" | "assistant" | "system"

export type AiOperationType =
  | "set_bpm"
  | "create_pattern"
  | "set_active_pattern"
  | "rename_pattern"
  | "set_pattern_length"
  | "add_channel"
  | "assign_plugin_to_channel"
  | "assign_sample_to_channel"
  | "add_sample_as_channel"
  | "clear_channel_pattern"
  | "set_step"
  | "add_piano_notes"
  | "add_chord_progression"
  | "set_channel_volume"
  | "set_channel_pan"
  | "set_channel_mute"
  | "set_channel_solo"
  | "set_channel_input_mode"
  | "set_channel_mixer_insert"
  | "add_playlist_pattern_clip"
  | "add_playlist_audio_clip"
  | "add_mixer_track"
  | "set_insert_fader"
  | "set_insert_pan"
  | "set_insert_stereo"
  | "set_fx_slot_effect"
  | "set_fx_reverb_param"
  | "set_fx_maximizer_param"
  | "set_fx_graphic_eq_band_gain"

export interface AiProviderModel {
  value: string
  label: string
}

export interface AiProviderConfig {
  id: AiProviderId
  label: string
  defaultModel: string
  keyStorage: string
  modelStorage: string
  keyPlaceholder: string
  models: readonly AiProviderModel[]
}

export interface AiChatMessage {
  role: AiChatRole
  content: string
}

export interface AiSample {
  name: string
  path: string
  folder: string
}

export interface AiRawOperation {
  type?: unknown
  payload?: unknown
}

export interface AiPreparedOperation {
  id: string
  type: AiOperationType
  payload: Record<string, unknown>
  description: string
  status?: "warning" | "ready"
  issues?: string[]
}

export interface AiRejectedOperation {
  index: number
  reason: string
}

export interface AiOperationResult {
  id: string
  description: string
  status: "applied" | "skipped" | "failed"
  reason?: string
}

export interface AiAgentPlan {
  message: string
  operations: AiRawOperation[]
}

export interface AiPlanRequest {
  apiKey: string
  model?: string
  userMessage: string
  projectSummary: AiProjectSummary
  conversationHistory?: AiChatMessage[]
}

export interface AiProjectSummary {
  transport: {
    bpm?: number
    mode?: string
  }
  activePatternId?: string
  activeChannelId?: string
  patterns: Array<Record<string, unknown>>
  channels: Array<Record<string, unknown>>
  mixerInserts: Array<Record<string, unknown>>
  availableInstruments: Array<Record<string, unknown>>
  availableEffects: Array<Record<string, unknown>>
  playlistTracks: Array<Record<string, unknown>>
  playlistClips: Array<Record<string, unknown>>
  availableSamples: AiSample[]
}

export interface AiConversationSummary {
  id: string
  title: string
  created_at: string
  updated_at: string
}

export interface AiConversation extends AiConversationSummary {
  messages: AiChatMessage[]
  pending_operations: AiPreparedOperation[]
  operation_results: AiOperationResult[]
  rejected_operations: AiRejectedOperation[]
}
