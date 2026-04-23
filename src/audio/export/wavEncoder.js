import { clamp } from "../../store/utils";

export function floatTo16BitPCM(input) {
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

export function getSafeWavEncoding(requestedBitDepth) {
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

export function audioBufferToWavBlob(audioBuffer, requestedBitDepth, options) {
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
