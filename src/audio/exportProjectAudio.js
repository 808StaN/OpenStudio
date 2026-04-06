import Soundfont from "soundfont-player";
import { getPluginInstrument } from "../data/pluginInstruments";
import { toSafeSampleUrl } from "../utils/sampleUrl";

const DEFAULT_SAMPLE_MIDI_PITCH = 72;
const PLUGIN_INSTRUMENT_GAIN_BOOST = 1.5;

const defaultSampleSettings = {
  cutItself: false,
  normalize: false,
  lengthPct: 100,
  fadeInPct: 0,
  fadeOutPct: 0,
  envEnabled: false,
  envDelayMs: 0,
  envAttackMs: 0,
  envHoldMs: 0,
  envDecayMs: 0,
  envSustainPct: 100,
  envReleaseMs: 0,
  attackMs: 8,
  releaseMs: 420,
  pitchCents: 0,
  monoMode: false,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function midiPitchToPlaybackRate(midiPitch) {
  const semitoneOffset = midiPitch - DEFAULT_SAMPLE_MIDI_PITCH;
  const rawRate = Math.pow(2, semitoneOffset / 12);
  return Math.max(0.125, Math.min(8, rawRate));
}

function getSafeSampleSettings(raw) {
  const hasPitchCents = Object.hasOwn(raw || {}, "pitchCents");
  const base = {
    ...defaultSampleSettings,
    attackMs: 8,
    releaseMs: 420,
    pitchCents: hasPitchCents
      ? Number(raw?.pitchCents)
      : Number(raw?.pitchSemitones || 0) * 100,
    monoMode: false,
    ...(raw || {}),
  };

  const next = {
    cutItself: Boolean(base.cutItself),
    normalize: Boolean(base.normalize),
    lengthPct: Math.max(5, Math.min(100, Number(base.lengthPct ?? 100))),
    fadeInPct: Math.max(0, Math.min(95, Number(base.fadeInPct ?? 0))),
    fadeOutPct: Math.max(0, Math.min(95, Number(base.fadeOutPct ?? 0))),
    envEnabled: Boolean(base.envEnabled),
    envDelayMs: Math.max(0, Math.min(3000, Number(base.envDelayMs ?? 0))),
    envAttackMs: Math.max(0, Math.min(3000, Number(base.envAttackMs ?? 0))),
    envHoldMs: Math.max(0, Math.min(3000, Number(base.envHoldMs ?? 0))),
    envDecayMs: Math.max(0, Math.min(3000, Number(base.envDecayMs ?? 0))),
    envSustainPct: Math.max(
      0,
      Math.min(100, Number(base.envSustainPct ?? 100)),
    ),
    envReleaseMs: Math.max(0, Math.min(3000, Number(base.envReleaseMs ?? 0))),
    attackMs: Math.max(0, Math.min(400, Number(base.attackMs ?? 8))),
    releaseMs: Math.max(0, Math.min(1000, Number(base.releaseMs ?? 420))),
    pitchCents: Math.max(
      -100,
      Math.min(100, Math.round(Number(base.pitchCents ?? 0))),
    ),
    monoMode: Boolean(base.monoMode),
  };

  const fadeTotal = next.fadeInPct + next.fadeOutPct;
  if (fadeTotal > 98) {
    const scale = 98 / fadeTotal;
    next.fadeInPct = Math.max(0, Math.round(next.fadeInPct * scale));
    next.fadeOutPct = Math.max(0, Math.round(next.fadeOutPct * scale));
  }

  return next;
}

function applyVolumeEnvelopeToGain(
  gainParam,
  startTime,
  gateDuration,
  settings,
) {
  const minGain = 0.0001;
  const envDelay = Math.max(0, Number(settings.envDelayMs ?? 0) / 1000);
  const envAttack = Math.max(0, Number(settings.envAttackMs ?? 0) / 1000);
  const envHold = Math.max(0, Number(settings.envHoldMs ?? 0) / 1000);
  const envDecay = Math.max(0, Number(settings.envDecayMs ?? 0) / 1000);
  const envRelease = Math.max(0, Number(settings.envReleaseMs ?? 0) / 1000);
  const envSustain = Math.max(
    minGain,
    Math.min(1, Number(settings.envSustainPct ?? 100) / 100),
  );

  const noteOffTime = startTime + Math.max(0.001, Number(gateDuration || 0));
  let cursor = startTime;

  gainParam.cancelScheduledValues(startTime);
  gainParam.setValueAtTime(minGain, startTime);

  const advanceWithHold = function (seconds, value) {
    const endTime = Math.min(noteOffTime, cursor + Math.max(0, seconds));
    gainParam.setValueAtTime(value, endTime);
    cursor = endTime;
  };

  const advanceWithRamp = function (seconds, targetValue) {
    const endTime = Math.min(noteOffTime, cursor + Math.max(0, seconds));
    if (endTime <= cursor) {
      gainParam.setValueAtTime(targetValue, cursor);
      return;
    }

    if (seconds > 0.0005) {
      gainParam.linearRampToValueAtTime(targetValue, endTime);
    } else {
      gainParam.setValueAtTime(targetValue, endTime);
    }

    cursor = endTime;
  };

  if (envDelay > 0) {
    advanceWithHold(envDelay, minGain);
  }

  if (cursor < noteOffTime) {
    advanceWithRamp(envAttack, 1);
  }

  if (cursor < noteOffTime) {
    advanceWithHold(envHold, 1);
  }

  if (cursor < noteOffTime) {
    advanceWithRamp(envDecay, envSustain);
  }

  gainParam.setValueAtTime(envSustain, noteOffTime);

  if (envRelease > 0.0005) {
    gainParam.linearRampToValueAtTime(minGain, noteOffTime + envRelease);
  } else {
    gainParam.setValueAtTime(minGain, noteOffTime);
  }
}

function buildInsertInputNodes(audioCtx, mixerInserts) {
  const inserts = Array.isArray(mixerInserts) ? mixerInserts : [];
  const insertMap = new Map();

  const masterInsert =
    inserts.find(function (insert) {
      return Boolean(insert?.isMaster);
    }) || null;

  const masterInput = audioCtx.createGain();
  const masterPanner = audioCtx.createStereoPanner();
  const masterGain = audioCtx.createGain();

  masterPanner.pan.value = clamp(Number(masterInsert?.pan || 0), -1, 1);
  masterGain.gain.value =
    masterInsert?.active === false
      ? 0
      : clamp(Number(masterInsert?.fader ?? 1), 0, 1.25);

  masterInput.connect(masterPanner);
  masterPanner.connect(masterGain);
  masterGain.connect(audioCtx.destination);

  inserts
    .filter(function (insert) {
      return !insert?.isMaster;
    })
    .forEach(function (insert) {
      const input = audioCtx.createGain();
      const panner = audioCtx.createStereoPanner();
      const gain = audioCtx.createGain();

      panner.pan.value = clamp(Number(insert?.pan || 0), -1, 1);
      gain.gain.value =
        insert?.active === false
          ? 0
          : clamp(Number(insert?.fader ?? 1), 0, 1.25);

      input.connect(panner);
      panner.connect(gain);
      gain.connect(masterInput);

      insertMap.set(insert.id, input);
    });

  const fallbackInsertInput = insertMap.values().next().value || masterInput;

  return {
    insertMap,
    masterInput,
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
    const effectiveLength = Math.min(clipLengthSteps, patternLengthSteps);
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

function audioBufferToWavBlob(audioBuffer, requestedBitDepth) {
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

  const length = channelData[0].length;
  const interleaved = new Float32Array(length * numChannels);

  for (let i = 0; i < length; i += 1) {
    for (let channel = 0; channel < numChannels; channel += 1) {
      interleaved[i * numChannels + channel] = channelData[channel][i];
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

async function audioBufferToMp3Blob(audioBuffer, requestedBitrateKbps) {
  const lamejsModule = await import("@breezystack/lamejs");
  const lamejs = lamejsModule?.default || lamejsModule;
  const Mp3Encoder = lamejs.Mp3Encoder;

  const bitrateKbps = clamp(Math.round(requestedBitrateKbps), 96, 320);

  const sampleRate = audioBuffer.sampleRate;
  const leftData = audioBuffer.getChannelData(0);
  const rightData =
    audioBuffer.numberOfChannels > 1
      ? audioBuffer.getChannelData(1)
      : audioBuffer.getChannelData(0);

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
  const tailSeconds = 1.6;
  const durationSeconds = Math.max(
    0.5,
    songLengthSteps * sixteenth + tailSeconds,
  );
  const sampleRate = 44100;
  const totalFrames = Math.max(1, Math.ceil(durationSeconds * sampleRate));
  const audioCtx = new OfflineAudioContext(2, totalFrames, sampleRate);

  const inserts = buildInsertInputNodes(audioCtx, mixerInserts);
  const channels = Array.isArray(project?.channels) ? project.channels : [];
  const events = collectEvents(project);

  const uniqueSampleRefs = Array.from(
    new Set(
      channels
        .map(function (channel) {
          return String(channel?.sampleRef || "").trim();
        })
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

  const getNormalizeGain = function (sampleBuffer) {
    const cached = normalizeGainByBuffer.get(sampleBuffer);
    if (Number.isFinite(cached)) {
      return cached;
    }

    let peak = 0;
    const channelsCount = Math.max(
      1,
      Number(sampleBuffer.numberOfChannels || 1),
    );

    for (let ch = 0; ch < channelsCount; ch += 1) {
      const channelData = sampleBuffer.getChannelData(ch);
      const step = Math.max(1, Math.floor(channelData.length / 64000));
      for (let i = 0; i < channelData.length; i += step) {
        const abs = Math.abs(channelData[i]);
        if (abs > peak) {
          peak = abs;
        }
      }
    }

    const normalizeGain =
      peak > 0.0001 ? Math.max(0.25, Math.min(4, 0.9 / peak)) : 1;
    normalizeGainByBuffer.set(sampleBuffer, normalizeGain);
    return normalizeGain;
  };

  events.forEach(function (event) {
    const channel = event.channel;
    const settings = getSafeSampleSettings(channel.sampleSettings);
    const insertInput =
      inserts.insertMap.get(channel.mixerInsertId) ||
      inserts.fallbackInsertInput;

    const noteStartTime = Math.max(
      0,
      Number(event.offsetSteps || 0) * sixteenth,
    );
    const noteLengthSteps = Math.max(0.0625, Number(event.lengthSteps || 1));

    const pluginRef = String(channel.pluginRef || "").trim();
    const plugin = pluginInstrumentByRef.get(pluginRef);
    const sampleRef = String(channel.sampleRef || "").trim();
    const sampleBuffer = sampleBufferByRef.get(sampleRef);

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
        0.03,
        Number(channel.volume || 0) * 0.16 * 2.2 * PLUGIN_INSTRUMENT_GAIN_BOOST,
      );

      try {
        plugin.play(transposedPitch, noteStartTime, {
          duration: noteDuration,
          gain: noteGain,
          attack: attackSec,
          release: releaseSec,
          pan: clamp(Number(channel.pan || 0), -1, 1),
          destination: insertInput,
        });
      } catch {
        return;
      }

      return;
    }

    if (!sampleBuffer) {
      return;
    }

    const source = audioCtx.createBufferSource();
    const gain = audioCtx.createGain();
    const envelopeGain = audioCtx.createGain();
    const panner = audioCtx.createStereoPanner();

    const safeMidiPitch = Number.isFinite(event.midiPitch)
      ? event.midiPitch
      : DEFAULT_SAMPLE_MIDI_PITCH;
    const pitchRate = Math.pow(2, Number(settings.pitchCents || 0) / 1200);
    const playbackRate = clamp(
      midiPitchToPlaybackRate(safeMidiPitch) * pitchRate,
      0.125,
      8,
    );

    const sampleReadDuration = Math.max(
      0.01,
      sampleBuffer.duration * (settings.lengthPct / 100),
    );
    const samplePlayableDuration = Math.max(
      0.01,
      sampleReadDuration / playbackRate,
    );
    const noteGateDuration = Math.max(0.01, noteLengthSteps * sixteenth);
    const envReleaseSec = settings.envEnabled
      ? Math.max(0, Number(settings.envReleaseMs ?? 0) / 1000)
      : 0;
    const sourcePlayDuration = settings.envEnabled
      ? Math.max(
          0.01,
          Math.min(samplePlayableDuration, noteGateDuration + envReleaseSec),
        )
      : samplePlayableDuration;
    const envelopeGateDuration = settings.envEnabled
      ? Math.max(0.01, Math.min(noteGateDuration, sourcePlayDuration))
      : sourcePlayDuration;

    const fadeInSec = sourcePlayDuration * (settings.fadeInPct / 100);
    const fadeOutSec = sourcePlayDuration * (settings.fadeOutPct / 100);
    const fadeTotal = fadeInSec + fadeOutSec;
    const fadeScale =
      fadeTotal > sourcePlayDuration * 0.98
        ? (sourcePlayDuration * 0.98) / Math.max(0.0001, fadeTotal)
        : 1;
    const finalFadeIn = fadeInSec * fadeScale;
    const finalFadeOut = fadeOutSec * fadeScale;
    const finalGain = Math.max(
      0.001,
      Number(channel.volume || 0) *
        0.2 *
        (settings.normalize ? getNormalizeGain(sampleBuffer) : 1),
    );
    const sampleStopAt = noteStartTime + sourcePlayDuration;
    const fadeOutStart = Math.max(noteStartTime, sampleStopAt - finalFadeOut);

    source.buffer = sampleBuffer;
    source.playbackRate.setValueAtTime(playbackRate, noteStartTime);

    if (finalFadeIn > 0.001) {
      gain.gain.setValueAtTime(0.0001, noteStartTime);
      gain.gain.linearRampToValueAtTime(finalGain, noteStartTime + finalFadeIn);
    } else {
      gain.gain.setValueAtTime(finalGain, noteStartTime);
    }

    gain.gain.setValueAtTime(finalGain, fadeOutStart);
    if (finalFadeOut > 0.001) {
      gain.gain.linearRampToValueAtTime(0.0001, sampleStopAt);
    } else {
      gain.gain.setValueAtTime(0.0001, sampleStopAt);
    }

    panner.pan.setValueAtTime(
      clamp(Number(channel.pan || 0), -1, 1),
      noteStartTime,
    );

    source.connect(gain);
    gain.connect(envelopeGain);

    if (settings.envEnabled) {
      applyVolumeEnvelopeToGain(
        envelopeGain.gain,
        noteStartTime,
        envelopeGateDuration,
        settings,
      );
    } else {
      envelopeGain.gain.setValueAtTime(1, noteStartTime);
    }

    envelopeGain.connect(panner);
    panner.connect(insertInput);

    source.start(
      noteStartTime,
      0,
      Math.min(
        sampleReadDuration,
        sampleBuffer.duration,
        sourcePlayDuration * playbackRate,
      ),
    );
    source.stop(sampleStopAt + 0.005);
  });

  const renderedBuffer = await audioCtx.startRendering();
  const blob =
    format === "mp3"
      ? await audioBufferToMp3Blob(renderedBuffer, mp3BitrateKbps)
      : audioBufferToWavBlob(renderedBuffer, wavEncoding.bitDepth);

  const fileName = safeBaseName + "." + format;
  triggerBrowserDownload(blob, fileName);

  return {
    blob,
    fileName,
    durationSeconds,
    mp3BitrateKbps,
    wavBitDepth: wavEncoding.bitDepth,
    wavBitDepthLabel: wavEncoding.label,
  };
}
