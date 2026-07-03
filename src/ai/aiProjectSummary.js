import { PLUGIN_EFFECTS } from "../data/pluginEffects";
import { PLUGIN_INSTRUMENTS } from "../data/pluginInstruments";

function summarizeFxSlots(insert) {
  return (Array.isArray(insert?.fxSlots) ? insert.fxSlots : [])
    .filter(function (slot) {
      return slot?.effectType && slot.effectType !== "none";
    })
    .map(function (slot) {
      return {
        id: slot.id,
        name: slot.name,
        enabled: Boolean(slot.enabled),
        effectType: slot.effectType,
      };
    });
}

export function buildAiProjectSummary(dawState, availableSamples = []) {
  const project = dawState?.project || {};
  const mixer = dawState?.mixer || {};
  const transport = dawState?.transport || {};

  return {
    transport: {
      bpm: transport.bpm,
      mode: transport.mode,
    },
    activePatternId: project.activePatternId,
    activeChannelId: project.activeChannelId,
    patterns: (Array.isArray(project.patterns) ? project.patterns : []).map(
      function (pattern) {
        return {
          id: pattern.id,
          name: pattern.name,
          lengthSteps: pattern.lengthSteps,
        };
      },
    ),
    channels: (Array.isArray(project.channels) ? project.channels : []).map(
      function (channel) {
        return {
          id: channel.id,
          name: channel.name,
          sampleRef: channel.sampleRef,
          pluginRef: channel.pluginRef,
          volume: channel.volume,
          pan: channel.pan,
          muted: Boolean(channel.muted),
          solo: Boolean(channel.solo),
          inputMode: channel.inputMode,
          mixerInsertId: channel.mixerInsertId,
        };
      },
    ),
    mixerInserts: (Array.isArray(mixer.inserts) ? mixer.inserts : []).map(
      function (insert) {
        return {
          id: insert.id,
          name: insert.name,
          isMaster: Boolean(insert.isMaster),
          active: Boolean(insert.active),
          fader: insert.fader,
          pan: insert.pan,
          stereoSeparation: insert.stereoSeparation,
          fxSlots: summarizeFxSlots(insert),
        };
      },
    ),
    availableInstruments: PLUGIN_INSTRUMENTS.map(function (instrument) {
      return {
        pluginRef: instrument.pluginRef,
        name: instrument.name,
        description: instrument.description,
      };
    }),
    availableEffects: PLUGIN_EFFECTS.map(function (effect) {
      return {
        effectType: effect.effectType,
        name: effect.name,
        description: effect.description,
      };
    }),
    playlistTracks: (Array.isArray(project.playlistTracks)
      ? project.playlistTracks
      : []
    ).map(function (track) {
      return {
        id: track.id,
        name: track.name,
      };
    }),
    playlistClips: (Array.isArray(project.playlistClips)
      ? project.playlistClips
      : []
    ).slice(0, 80).map(function (clip) {
      return {
        id: clip.id,
        clipType: clip.clipType,
        patternId: clip.patternId,
        samplePath: clip.samplePath,
        channelId: clip.channelId,
        trackId: clip.trackId,
        barStart: clip.barStart,
        barLength: clip.barLength,
      };
    }),
    availableSamples,
  };
}
