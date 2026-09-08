export interface PianoNote {
  id?: string
  start: number
  length: number
  pitch: number
  velocity: number
}

export interface DawChannel {
  id: string
  name: string
  sampleRef: string
  pluginRef: string
  volume: number
  pan: number
  muted: boolean
  solo: boolean
  inputMode: string
  mixerInsertId: string
}

export interface DawPattern {
  id: string
  name: string
  lengthSteps: number
  pianoPreview: Record<string, PianoNote[]>
  stepGrid: Record<string, boolean[]>
}

export interface DawFxSlot {
  id: string
  name: string
  enabled: boolean
  effectType: string
}

export interface DawMixerInsert {
  id: string
  name: string
  isMaster: boolean
  active: boolean
  fader: number
  pan: number
  stereoSeparation: number
  fxSlots: DawFxSlot[]
}

export interface DawPlaylistTrack {
  id: string
  name: string
}

export interface DawPlaylistClip {
  id: string
  clipType?: string
  patternId?: string
  samplePath?: string
  channelId?: string
  trackId: string
  barStart: number
  barLength: number
}

export interface DawState {
  transport: {
    bpm: number
    mode: string
  }
  project: {
    activePatternId: string
    activeChannelId: string
    patterns: DawPattern[]
    channels: DawChannel[]
    playlistTracks: DawPlaylistTrack[]
    playlistClips: DawPlaylistClip[]
  }
  mixer: {
    inserts: DawMixerInsert[]
  }
}
