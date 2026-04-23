import { floatTo16BitPCM } from "./wavEncoder";
import { clamp } from "../../store/utils";

export async function audioBufferToMp3Blob(
  audioBuffer,
  requestedBitrateKbps,
  options,
) {
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
