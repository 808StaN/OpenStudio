import Soundfont from "soundfont-player";
import {
  GRAPHIC_EQ_DEFAULT_POINT_FREQUENCIES,
} from "./domain/fxParams";
import { applyInsertSettings } from "./core/applyInsertSettings";
import { createMixerInsertNodes } from "./core/createMixerInsertNodes";
import { computeSamplePlaybackParams } from "./core/computeSamplePlaybackParams";
import { createSamplePlaybackNodes } from "./core/createSamplePlaybackNodes";
import { DEFAULT_SAMPLE_MIDI_PITCH, midiPitchToPlaybackRate } from "./domain/pitch";
import { getSafeSampleSettings } from "./domain/sampleSettings";
import { getTimeStretchProfile } from "./domain/timeStretch";
import { getPluginInstrument } from "../data/pluginInstruments";
import { toSafeSampleUrl } from "../utils/sampleUrl";
import { getNormalizeGain } from "./core/getNormalizeGain";
import { getOrCreateStretchedBuffer } from "./core/getOrCreateStretchedBuffer";

const DEFAULT_NOTE_VELOCITY = 95;
const PLUGIN_INSTRUMENT_GAIN_BOOST = 1.5;
const BASE_CHANNEL_TRIGGER_GAIN = 0.75;
const CUT_ITSELF_RELEASE_SEC = 0.01;
const CUT_ITSELF_MAX_RETRIGGER_RELEASE_SEC = 0.016;
const CUT_ITSELF_STOP_PADDING_SEC = 0.003;
const CUT_ITSELF_RETRIGGER_FADE_IN_SEC = 0.0025;

import { clamp } from "../store/utils";

// Builds the offline mixer graph once; each scheduled source only plugs into insert inputs.
function buildInsertInputNodes(audioCtx, mixerInserts) {
  const inserts = Array.isArray(mixerInserts) ? mixerInserts : [];
  const { insertMap, getOutputNode } = createMixerInsertNodes(
    audioCtx,
    inserts,
    { includeAnalysers: false },
  );

  // Wire inter-insert routes.
  inserts.forEach(function (insert) {
    const node = insertMap.get(insert.id);
    if (!node) {
      return;
    }

    const routes =
      Array.isArray(insert.routesTo) && insert.routesTo.length > 0
        ? insert.routesTo
        : insert.isMaster
          ? []
          : ["master"];

    let hasConnectedRoute = false;
    routes.forEach(function (targetId) {
      const target = insertMap.get(targetId);
      if (!target) {
        return;
      }
      getOutputNode(node).connect(target.inputGain);
      hasConnectedRoute = true;
    });

    if (insert.isMaster || !hasConnectedRoute) {
      getOutputNode(node).connect(audioCtx.destination);
    }
  });

  // Apply initial parameter values at time 0.
  inserts.forEach(function (insert) {
    const node = insertMap.get(insert.id);
    if (!node) {
      return;
    }
    applyInsertSettings(node, insert, 0, { useSmoothing: false });
  });

  const masterNode =
    insertMap.get("master") ||
    inserts
      .filter(function (insert) {
        return insert?.isMaster;
      })
      .map(function (insert) {
        return insertMap.get(insert.id);
      })
      .find(Boolean) ||
    null;

  const fallbackInsertInput =
    inserts
      .filter(function (insert) {
        return !insert?.isMaster;
      })
      .map(function (insert) {
        return insertMap.get(insert.id)?.inputGain;
      })
      .find(Boolean) ||
    masterNode?.inputGain ||
    audioCtx.destination;

  return {
    insertMap,
    masterInput: masterNode?.inputGain || audioCtx.destination,
    fallbackInsertInput,
  };
}

function getSongLengthInSteps(project) {
  const patterns = Array.isArray(project?.patterns) ? project.patterns : [];
  const patternsById = patterns.reduce(function (acc, pattern) {
    acc[pattern.id] = pattern;
    return acc;
  }, {});
  const clips = Array.isArray(project?.playlistClips)
    ? project.playlistClips
    : [];

  if (clips.length === 0) {
    const fallbackPattern = patterns.find(Boolean);
    return Math.max(1, Number(fallbackPattern?.lengthSteps || 16));
  }

  let maxSongStep = 16;
  clips.forEach(function (clip) {
    const clipType = String(clip?.clipType || "pattern").toLowerCase();
    const isAudioClip = clipType === "audio";
    const pattern = patternsById[clip.patternId];
    const clipStartStep = Math.max(
      0,
      Math.round((Number(clip.barStart || 1) - 1) * 16),
    );
    const clipLengthSteps = Math.max(
      1,
      Math.round(Number(clip.barLength || 1) * 16),
    );
    const patternLengthSteps = Math.max(1, Number(pattern?.lengthSteps || 16));
    const effectiveLength = isAudioClip
      ? clipLengthSteps
      : Math.min(clipLengthSteps, patternLengthSteps);
    maxSongStep = Math.max(maxSongStep, clipStartStep + effectiveLength);
  });

  return maxSongStep;
}

function collectEvents(project) {
  const channels = Array.isArray(project?.channels) ? project.channels : [];
  const patterns = Array.isArray(project?.patterns) ? project.patterns : [];
  const clips = Array.isArray(project?.playlistClips)
    ? project.playlistClips
    : [];

  const patternsById = patterns.reduce(function (acc, pattern) {
    acc[pattern.id] = pattern;
    return acc;
  }, {});

  const soloChannels = channels.filter(function (channel) {
    return Boolean(channel?.solo);
  });

  const events = [];

  clips.forEach(function (clip) {
    const clipType = String(clip?.clipType || "pattern").toLowerCase();
    if (clipType === "audio") {
      return;
    }

    const pattern = patternsById[clip.patternId];
    if (!pattern) {
      return;
    }

    const clipStartStep = Math.max(
      0,
      Math.round((Number(clip.barStart || 1) - 1) * 16),
    );
    const clipLengthSteps = Math.max(
      1,
      Math.round(Number(clip.barLength || 1) * 16),
    );
    const patternLength = Math.max(1, Number(pattern.lengthSteps || 16));
    const maxSteps = Math.min(clipLengthSteps, patternLength);

    channels.forEach(function (channel) {
      if (!channel || channel.muted) {
        return;
      }
      if (soloChannels.length > 0 && !channel.solo) {
        return;
      }

      const row = pattern.stepGrid?.[channel.id] || [];
      for (let stepIndex = 0; stepIndex < maxSteps; stepIndex += 1) {
        if (!row[stepIndex]) {
          continue;
        }

        events.push({
          channel,
          midiPitch: DEFAULT_SAMPLE_MIDI_PITCH,
          velocity: DEFAULT_NOTE_VELOCITY,
          offsetSteps: clipStartStep + stepIndex,
          lengthSteps: 1,
        });
      }

      const pianoNotes = pattern.pianoPreview?.[channel.id] || [];
      pianoNotes.forEach(function (note) {
        const noteStart = Math.max(0, Number(note.start || 0));
        if (noteStart >= maxSteps) {
          return;
        }

        events.push({
          channel,
          midiPitch: clamp(
            Math.round(Number(note.pitch || DEFAULT_SAMPLE_MIDI_PITCH)),
            0,
            127,
          ),
          velocity: clamp(
            Math.round(Number(note.velocity || DEFAULT_NOTE_VELOCITY)),
            1,
            127,
          ),
          offsetSteps: clipStartStep + noteStart,
          lengthSteps: Math.max(0.0625, Number(note.length || 1)),
        });
      });
    });
  });

  events.sort(function (a, b) {
    return a.offsetSteps - b.offsetSteps;
  });

  return events;
}

function floatTo16BitPCM(input) {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const sample = clamp(input[i], -1, 1);
    output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output;
}

function writeString(view, offset, value) {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

function getSafeWavEncoding(requestedBitDepth) {
  const bitDepth = Math.round(Number(requestedBitDepth || 32));

  if (bitDepth === 16) {
    return {
      bitDepth: 16,
      audioFormat: 1,
      label: "16Bit int",
    };
  }

  if (bitDepth === 24) {
    return {
      bitDepth: 24,
      audioFormat: 1,
      label: "24Bit int",
    };
  }

  return {
    bitDepth: 32,
    audioFormat: 3,
    label: "32Bit float",
  };
}

function audioBufferToWavBlob(audioBuffer, requestedBitDepth, options) {
  const startFrame = Math.max(0, Math.floor(Number(options?.startFrame || 0)));
  const maxFrames = Math.max(1, audioBuffer.length - startFrame);
  const requestedFrames = Number(options?.frameLength || maxFrames);
  const frameLength = Math.max(
    1,
    Math.min(maxFrames, Math.floor(requestedFrames)),
  );
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const wavEncoding = getSafeWavEncoding(requestedBitDepth);
  const format = wavEncoding.audioFormat;
  const bitDepth = wavEncoding.bitDepth;
  const bytesPerSample = bitDepth / 8;

  const channelData = Array.from({ length: numChannels }).map(
    function (_, index) {
      return audioBuffer.getChannelData(index);
    },
  );

  const interleaved = new Float32Array(frameLength * numChannels);

  for (let i = 0; i < frameLength; i += 1) {
    const sourceIndex = startFrame + i;
    for (let channel = 0; channel < numChannels; channel += 1) {
      interleaved[i * numChannels + channel] =
        channelData[channel][sourceIndex] || 0;
    }
  }

  const blockAlign = (numChannels * bitDepth) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = interleaved.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < interleaved.length; i += 1) {
    const sample = clamp(interleaved[i], -1, 1);

    if (bitDepth === 16) {
      const int16Sample = Math.round(
        sample < 0 ? sample * 0x8000 : sample * 0x7fff,
      );
      view.setInt16(offset, int16Sample, true);
      offset += 2;
      continue;
    }

    if (bitDepth === 24) {
      let int24Sample = Math.round(
        sample < 0 ? sample * 0x800000 : sample * 0x7fffff,
      );
      int24Sample = Math.max(-0x800000, Math.min(0x7fffff, int24Sample));

      if (int24Sample < 0) {
        int24Sample += 0x1000000;
      }

      view.setUint8(offset, int24Sample & 0xff);
      view.setUint8(offset + 1, (int24Sample >> 8) & 0xff);
      view.setUint8(offset + 2, (int24Sample >> 16) & 0xff);
      offset += 3;
      continue;
    }

    view.setFloat32(offset, sample, true);
    offset += 4;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

async function audioBufferToMp3Blob(audioBuffer, requestedBitrateKbps, options) {
  const startFrame = Math.max(0, Math.floor(Number(options?.startFrame || 0)));
  const maxFrames = Math.max(1, audioBuffer.length - startFrame);
  const requestedFrames = Number(options?.frameLength || maxFrames);
  const frameLength = Math.max(
    1,
    Math.min(maxFrames, Math.floor(requestedFrames)),
  );

  const lamejsModule = await import("@breezystack/lamejs");
  const lamejs = lamejsModule?.default || lamejsModule;
  const Mp3Encoder = lamejs.Mp3Encoder;

  const bitrateKbps = clamp(Math.round(requestedBitrateKbps), 96, 320);

  const sampleRate = audioBuffer.sampleRate;
  const leftData = audioBuffer
    .getChannelData(0)
    .subarray(startFrame, startFrame + frameLength);
  const rightData =
    audioBuffer.numberOfChannels > 1
      ? audioBuffer
          .getChannelData(1)
          .subarray(startFrame, startFrame + frameLength)
      : leftData;

  const left = floatTo16BitPCM(leftData);
  const right = floatTo16BitPCM(rightData);

  const encoder = new Mp3Encoder(2, sampleRate, bitrateKbps);
  const chunkSize = 1152;
  const mp3Data = [];

  for (let i = 0; i < left.length; i += chunkSize) {
    const leftChunk = left.subarray(i, i + chunkSize);
    const rightChunk = right.subarray(i, i + chunkSize);
    const mp3buf = encoder.encodeBuffer(leftChunk, rightChunk);
    if (mp3buf.length > 0) {
      mp3Data.push(new Uint8Array(mp3buf));
    }
  }

  const endBuf = encoder.flush();
  if (endBuf.length > 0) {
    mp3Data.push(new Uint8Array(endBuf));
  }

  return new Blob(mp3Data, { type: "audio/mpeg" });
}

function triggerBrowserDownload(blob, fileName) {
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(downloadUrl);
}

export async function renderPlaylistArrangementToFile(options) {
  const project = options?.project || {};
  const mixerInserts = Array.isArray(options?.mixerInserts)
    ? options.mixerInserts
    : [];
  const bpm = Math.max(40, Math.min(300, Number(options?.bpm || 140)));
  const format =
    String(options?.format || "wav").toLowerCase() === "mp3" ? "mp3" : "wav";
  const mp3BitrateKbps = clamp(
    Math.round(Number(options?.mp3BitrateKbps || 320)),
    96,
    320,
  );
  const wavEncoding = getSafeWavEncoding(options?.wavBitDepth);
  const requestedName = String(options?.fileName || "render").trim();
  const safeBaseName =
    requestedName.replace(/[\\/:*?"<>|]+/g, "_").trim() || "render";

  const songLengthSteps = getSongLengthInSteps(project);
  const sixteenth = 60 / bpm / 4;
  const renderStartOffsetSec = 0.12;
  const tailSeconds = 1.6;
  const contentDurationSeconds = Math.max(
    0.5,
    songLengthSteps * sixteenth + tailSeconds,
  );
  const durationSeconds = contentDurationSeconds + renderStartOffsetSec;
  const sampleRate = 44100;
  const totalFrames = Math.max(1, Math.ceil(durationSeconds * sampleRate));
  const audioCtx = new OfflineAudioContext(2, totalFrames, sampleRate);

  const inserts = buildInsertInputNodes(audioCtx, mixerInserts);
  const channels = Array.isArray(project?.channels) ? project.channels : [];
  const playlistClips = Array.isArray(project?.playlistClips)
    ? project.playlistClips
    : [];
  const events = collectEvents(project);

  const uniqueSampleRefs = Array.from(
    new Set(
      channels
        .map(function (channel) {
          return String(channel?.sampleRef || "").trim();
        })
        .concat(
          playlistClips.map(function (clip) {
            return String(clip?.samplePath || "").trim();
          }),
        )
        .filter(Boolean),
    ),
  );

  const sampleBufferByRef = new Map();
  await Promise.all(
    uniqueSampleRefs.map(async function (sampleRef) {
      try {
        const safeSampleRef = toSafeSampleUrl(sampleRef);
        if (!safeSampleRef) {
          return;
        }

        const response = await fetch(safeSampleRef);
        if (!response.ok) {
          return;
        }
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(
          arrayBuffer.slice(0),
        );
        sampleBufferByRef.set(sampleRef, audioBuffer);
        sampleBufferByRef.set(safeSampleRef, audioBuffer);
      } catch {
        return;
      }
    }),
  );

  const uniquePluginRefs = Array.from(
    new Set(
      channels
        .map(function (channel) {
          return String(channel?.pluginRef || "").trim();
        })
        .filter(Boolean),
    ),
  );

  const pluginInstrumentByRef = new Map();
  await Promise.all(
    uniquePluginRefs.map(async function (pluginRef) {
      const pluginMeta = getPluginInstrument(pluginRef);
      if (!pluginMeta?.soundfont) {
        return;
      }

      try {
        const instrument = await Soundfont.instrument(
          audioCtx,
          pluginMeta.soundfont,
          {
            destination: inserts.masterInput,
          },
        );
        pluginInstrumentByRef.set(pluginRef, instrument);
      } catch {
        return;
      }
    }),
  );

  const normalizeGainByBuffer = new WeakMap();
  const stretchedSampleBufferCache = new WeakMap();

  const activeSampleVoicesByChannel = new Map();

  const stopActiveChannelSamples = function (channelId, atTime) {
    const voices = activeSampleVoicesByChannel.get(channelId);
    if (!voices || voices.size === 0) {
      return false;
    }

    voices.forEach(function (voice) {
      try {
        const releaseSec = Math.min(
          CUT_ITSELF_MAX_RETRIGGER_RELEASE_SEC,
          Math.max(CUT_ITSELF_RELEASE_SEC, Number(voice.cutReleaseSec || 0)),
        );
        const tau = Math.max(0.001, releaseSec * 0.25);
        const voiceStopAt = atTime + releaseSec;
        // Do not cancel existing automation here, otherwise we can introduce
        // discontinuities in OfflineAudioContext and audible clicks.
        voice.gain.gain.setTargetAtTime(0.0001, atTime, tau);
        voice.source.stop(voiceStopAt + CUT_ITSELF_STOP_PADDING_SEC);
      } catch {
        return;
      }
    });

    voices.clear();
    return true;
  };

  const activeSynthVoicesByChannel = new Map();

  const stopActiveChannelSynthVoices = function (channelId, atTime) {
    const voices = activeSynthVoicesByChannel.get(channelId);
    if (!voices || voices.size === 0) {
      return false;
    }

    voices.forEach(function (voice) {
      try {
        if (voice.node && typeof voice.node.stop === "function") {
          voice.node.stop(atTime);
        }
      } catch {
        return;
      }
    });

    voices.clear();
    return true;
  };

  events.forEach(function (event) {
    const channel = event.channel;
    const settings = getSafeSampleSettings(channel.sampleSettings);
    const insertNode = inserts.insertMap.get(channel.mixerInsertId);
    const insertInput = insertNode?.inputGain || inserts.fallbackInsertInput;
    const channelId = String(channel?.id || "").trim();

    const noteStartTime = Math.max(
      0,
      Number(event.offsetSteps || 0) * sixteenth + renderStartOffsetSec,
    );
    const noteLengthSteps = Math.max(0.0625, Number(event.lengthSteps || 1));

    const pluginRef = String(channel.pluginRef || "").trim();
    const plugin = pluginInstrumentByRef.get(pluginRef);
    const sampleRef = String(channel.sampleRef || "").trim();
    const sampleBuffer = sampleBufferByRef.get(sampleRef);
    const channelVolume = clamp(Number(channel.volume ?? 1), 0, 1);
    const velocityScale = clamp(
      Number(event.velocity || DEFAULT_NOTE_VELOCITY) / 127,
      1 / 127,
      1,
    );
    const channelBaseGain =
      BASE_CHANNEL_TRIGGER_GAIN * channelVolume * velocityScale;

    if (plugin) {
      const transposedPitch = clamp(
        Number(event.midiPitch || DEFAULT_SAMPLE_MIDI_PITCH) +
          Number(settings.pitchCents || 0) / 100,
        0,
        127,
      );
      const attackSec = Math.max(0, Number(settings.attackMs || 0) / 1000);
      const releaseSec = Math.max(0, Number(settings.releaseMs ?? 420) / 1000);
      const noteDuration = Math.max(
        0.1,
        noteLengthSteps * sixteenth * 0.95 + releaseSec,
      );
      const noteGain = Math.max(
        0,
        channelBaseGain * 2.2 * PLUGIN_INSTRUMENT_GAIN_BOOST,
      );

      if (settings.monoMode && channelId) {
        stopActiveChannelSynthVoices(channelId, noteStartTime);
      }

      try {
        const voiceNode = plugin.play(transposedPitch, noteStartTime, {
          duration: noteDuration,
          gain: noteGain,
          attack: attackSec,
          release: releaseSec,
          pan: clamp(Number(channel.pan || 0), -1, 1),
          destination: insertInput,
        });

        if (voiceNode && typeof voiceNode.stop === "function") {
          const channelVoices =
            activeSynthVoicesByChannel.get(channelId) || new Set();
          if (!activeSynthVoicesByChannel.has(channelId)) {
            activeSynthVoicesByChannel.set(channelId, channelVoices);
          }
          channelVoices.add({ node: voiceNode });
        }
      } catch {
        return;
      }

      return;
    }

    if (!sampleBuffer) {
      return;
    }

    const normalizeGain = settings.normalize
      ? getNormalizeGain(sampleBuffer, normalizeGainByBuffer)
      : null;

    const safeMidiPitch = Number.isFinite(event.midiPitch)
      ? event.midiPitch
      : DEFAULT_SAMPLE_MIDI_PITCH;
    const pitchRate = Math.pow(2, Number(settings.pitchCents || 0) / 1200);
    const basePlaybackRate = Math.max(
      0.125,
      Math.min(8, midiPitchToPlaybackRate(safeMidiPitch) * pitchRate),
    );
    const sampleReadDuration = Math.max(
      0.01,
      sampleBuffer.duration * (settings.lengthPct / 100),
    );
    const stretchProfile = getTimeStretchProfile(
      settings,
      sampleReadDuration,
      bpm,
      basePlaybackRate,
    );

    const voiceParams = computeSamplePlaybackParams(
      sampleBuffer,
      settings,
      event.midiPitch,
      noteLengthSteps,
      sixteenth,
      normalizeGain,
      {
        playbackRate: stretchProfile.playbackRate,
        samplePlayableDuration: stretchProfile.useGranularStretch
          ? stretchProfile.targetDurationSec
          : undefined,
      },
    );

    let didRetriggerCut = false;
    if (settings.cutItself && channelId) {
      didRetriggerCut = stopActiveChannelSamples(channelId, noteStartTime);
    }

    let scheduledBuffer = sampleBuffer;
    if (stretchProfile.useGranularStretch) {
      scheduledBuffer = getOrCreateStretchedBuffer(
        audioCtx,
        sampleBuffer,
        sampleReadDuration,
        voiceParams.sourcePlayDuration * voiceParams.playbackRate,
        stretchedSampleBufferCache,
      );
    }

    const finalGain = Math.max(
      0,
      channelBaseGain * (normalizeGain || 1),
    );

    const { source, gain } = createSamplePlaybackNodes(
      audioCtx,
      scheduledBuffer,
      voiceParams,
      insertInput,
      noteStartTime,
      clamp(Number(channel.pan || 0), -1, 1),
      finalGain,
      settings,
      {
        retriggerFadeInSec: didRetriggerCut
          ? CUT_ITSELF_RETRIGGER_FADE_IN_SEC
          : 0,
      },
    );

    const requiredBufferDuration = Math.max(
      0.01,
      voiceParams.sourcePlayDuration * voiceParams.playbackRate,
    );
    source.start(
      noteStartTime,
      0,
      Math.min(scheduledBuffer.duration, requiredBufferDuration),
    );
    source.stop(noteStartTime + voiceParams.sourcePlayDuration + 0.005);

    if (channelId) {
      const channelVoices =
        activeSampleVoicesByChannel.get(channelId) || new Set();
      if (!activeSampleVoicesByChannel.has(channelId)) {
        activeSampleVoicesByChannel.set(channelId, channelVoices);
      }

      const voice = {
        source,
        gain,
        cutReleaseSec: Math.max(
          CUT_ITSELF_RELEASE_SEC,
          voiceParams.finalFadeOut,
        ),
      };

      channelVoices.add(voice);

      source.onended = function () {
        const voices = activeSampleVoicesByChannel.get(channelId);
        if (!voices) {
          return;
        }
        voices.delete(voice);
        if (voices.size === 0) {
          activeSampleVoicesByChannel.delete(channelId);
        }
      };
    }
  });

  const soloChannels = channels.filter(function (channel) {
    return Boolean(channel?.solo);
  });
  const channelsById = channels.reduce(function (acc, channel) {
    if (channel?.id) {
      acc[channel.id] = channel;
    }
    return acc;
  }, {});

  playlistClips.forEach(function (clip) {
    const clipType = String(clip?.clipType || "pattern").toLowerCase();
    if (clipType !== "audio") {
      return;
    }

    const channelId = String(clip.channelId || "").trim();
    const channel = channelId ? channelsById[channelId] : null;
    if (channel?.muted) {
      return;
    }
    if (soloChannels.length > 0 && channel && !channel.solo) {
      return;
    }

    const sampleRef = String(clip.samplePath || channel?.sampleRef || "").trim();
    const safeSampleRef = toSafeSampleUrl(sampleRef);
    if (!sampleRef || !safeSampleRef) {
      return;
    }

    const sampleBuffer =
      sampleBufferByRef.get(safeSampleRef) || sampleBufferByRef.get(sampleRef);
    if (!sampleBuffer) {
      return;
    }

    const settings = getSafeSampleSettings(channel?.sampleSettings);
    const insertNode = channel
      ? inserts.insertMap.get(channel.mixerInsertId)
      : null;
    const insertInput = insertNode?.inputGain || inserts.fallbackInsertInput;

    const clipStartStep = Math.max(
      0,
      Math.round((Number(clip.barStart || 1) - 1) * 16),
    );
    const clipLengthSteps = Math.max(
      1,
      Math.round(Number(clip.barLength || 1) * 16),
    );
    const clipOffsetSteps = Math.max(0, Number(clip.sourceOffsetSteps || 0));

    const clipStartTime = clipStartStep * sixteenth + renderStartOffsetSec;
    const clipOffsetSec = clipOffsetSteps * sixteenth;
    const clipTotalDurationSec = Math.max(0.01, clipLengthSteps * sixteenth);
    const clipRemainingDurationSec = Math.max(
      0,
      clipTotalDurationSec - clipOffsetSec,
    );
    if (clipRemainingDurationSec <= 0.0001) {
      return;
    }

    const sampleReadDuration = Math.max(
      0.01,
      Number(sampleBuffer.duration || 0) * (settings.lengthPct / 100),
    );
    const basePlaybackRate = Math.max(
      0.125,
      Math.min(8, Math.pow(2, Number(settings.pitchCents || 0) / 1200)),
    );
    const stretchProfile = getTimeStretchProfile(
      settings,
      sampleReadDuration,
      bpm,
      basePlaybackRate,
    );
    const playbackRate = stretchProfile.playbackRate;
    const naturalPlayableDuration = Math.max(
      0.01,
      sampleReadDuration / playbackRate,
    );
    const totalPlayableDuration = Math.max(
      0.01,
      stretchProfile.useGranularStretch
        ? stretchProfile.targetDurationSec
        : naturalPlayableDuration,
    );
    const remainingPlayableDuration = Math.max(
      0,
      totalPlayableDuration - clipOffsetSec,
    );
    const playDuration = Math.max(
      0,
      Math.min(clipRemainingDurationSec, remainingPlayableDuration),
    );
    if (playDuration <= 0.0001) {
      return;
    }

    let scheduledBuffer = sampleBuffer;
    let maxReadableDuration = sampleReadDuration;
    if (stretchProfile.useGranularStretch) {
      const desiredBufferedDuration = Math.max(
        0.01,
        totalPlayableDuration * playbackRate,
      );
      scheduledBuffer = getOrCreateStretchedBuffer(
        audioCtx,
        sampleBuffer,
        sampleReadDuration,
        desiredBufferedDuration,
        stretchedSampleBufferCache,
      );
      maxReadableDuration = Math.max(
        0.01,
        Math.min(scheduledBuffer.duration, desiredBufferedDuration),
      );
    }

    const sourceOffsetSec = clipOffsetSec * playbackRate;
    if (sourceOffsetSec >= maxReadableDuration) {
      return;
    }

    const sourceReadDuration = Math.max(
      0.01,
      Math.min(
        maxReadableDuration - sourceOffsetSec,
        playDuration * playbackRate,
      ),
    );
    const fadeOutAt = clipStartTime + Math.max(0, playDuration - 0.012);
    const clipGain = Math.max(
      0.01,
      Number(channel?.volume ?? 0.75) *
        0.36 *
        (settings.normalize
          ? getNormalizeGain(sampleBuffer, normalizeGainByBuffer)
          : 1),
    );
    const clipPan = clamp(Number(channel?.pan ?? 0), -1, 1);

    const source = audioCtx.createBufferSource();
    const gain = audioCtx.createGain();
    const panner = audioCtx.createStereoPanner();

    source.buffer = scheduledBuffer;
    source.playbackRate.setValueAtTime(playbackRate, clipStartTime);
    gain.gain.setValueAtTime(clipGain, clipStartTime);
    gain.gain.setValueAtTime(clipGain, fadeOutAt);
    gain.gain.linearRampToValueAtTime(0.0001, clipStartTime + playDuration);
    panner.pan.setValueAtTime(clipPan, clipStartTime);

    source.connect(gain);
    gain.connect(panner);
    panner.connect(insertInput);

    source.start(clipStartTime, sourceOffsetSec, sourceReadDuration);
    source.stop(clipStartTime + playDuration + 0.005);
  });

  const renderedBuffer = await audioCtx.startRendering();
  const startFrame = Math.max(0, Math.floor(renderStartOffsetSec * sampleRate));
  const frameLength = Math.max(
    1,
    Math.min(renderedBuffer.length - startFrame, Math.floor(contentDurationSeconds * sampleRate)),
  );
  const blob =
    format === "mp3"
      ? await audioBufferToMp3Blob(renderedBuffer, mp3BitrateKbps, {
          startFrame,
          frameLength,
        })
      : audioBufferToWavBlob(renderedBuffer, wavEncoding.bitDepth, {
          startFrame,
          frameLength,
        });

  const fileName = safeBaseName + "." + format;
  triggerBrowserDownload(blob, fileName);

  return {
    blob,
    fileName,
    durationSeconds: contentDurationSeconds,
    mp3BitrateKbps,
    wavBitDepth: wavEncoding.bitDepth,
    wavBitDepthLabel: wavEncoding.label,
  };
}

