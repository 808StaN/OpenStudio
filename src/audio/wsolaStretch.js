import { clamp } from "../store/utils";

function buildKaliParams(sampleRate, factor) {
  const safeFactor = Math.max(0.25, Math.min(4, Number(factor || 1)));

  const segmentMs = Math.max(10, 82 / Math.max(safeFactor, 1));
  const searchMs = segmentMs / 6;
  let overlap = Math.max(
    Math.floor((sampleRate * (segmentMs / 7)) / 1000 + 4.5),
    16,
  );
  const segment = Math.max(
    32,
    Math.floor((sampleRate * segmentMs) / 1000 + 0.5),
  );
  const search = Math.max(8, Math.floor((sampleRate * searchMs) / 1000 + 0.5));

  if (overlap * 2 > segment) {
    overlap = Math.max(16, overlap - 8);
  }

  const maxSkip = Math.ceil(safeFactor * (segment - overlap));
  const processSize = Math.max(maxSkip + overlap, segment) + search;

  return {
    factor: safeFactor,
    segment,
    search,
    overlap,
    processSize,
  };
}

function buildInterleavedInput(sampleBuffer, readFrames) {
  const channels = Math.max(1, Number(sampleBuffer.numberOfChannels || 1));
  const interleaved = new Float32Array(readFrames * channels);

  for (let ch = 0; ch < channels; ch += 1) {
    const channelData = sampleBuffer.getChannelData(ch);
    for (let frame = 0; frame < readFrames; frame += 1) {
      interleaved[frame * channels + ch] = channelData[frame] || 0;
    }
  }

  return interleaved;
}

function squaredDifferenceInterleaved(a, aFrameOffset, b, frames, channels) {
  let diff = 0;
  const start = aFrameOffset * channels;
  const count = frames * channels;

  for (let i = 0; i < count; i += 1) {
    const delta = (a[start + i] || 0) - (b[i] || 0);
    diff += delta * delta;
  }

  return diff;
}

function bestOverlapPosition(
  inputData,
  inputFramePos,
  overlapBuf,
  params,
  channels,
  quickSearch,
) {
  const search = params.search;
  const overlap = params.overlap;
  let prevBest = (search + 1) >>> 1;
  let step = 64;
  let bestPos = quickSearch ? prevBest : 0;
  let leastDiff = squaredDifferenceInterleaved(
    inputData,
    inputFramePos + bestPos,
    overlapBuf,
    overlap,
    channels,
  );

  if (quickSearch) {
    do {
      for (let dir = -1; dir <= 1; dir += 2) {
        for (let j = 1; j < 4 || step === 64; j += 1) {
          const candidate = prevBest + dir * j * step;
          if (candidate < 0 || candidate >= search) {
            break;
          }

          const diff = squaredDifferenceInterleaved(
            inputData,
            inputFramePos + candidate,
            overlapBuf,
            overlap,
            channels,
          );

          if (diff < leastDiff) {
            leastDiff = diff;
            bestPos = candidate;
          }
        }
      }

      prevBest = bestPos;
      step = step >>> 2;
    } while (step > 0);
  } else {
    for (let i = 1; i < search; i += 1) {
      const diff = squaredDifferenceInterleaved(
        inputData,
        inputFramePos + i,
        overlapBuf,
        overlap,
        channels,
      );
      if (diff < leastDiff) {
        leastDiff = diff;
        bestPos = i;
      }
    }
  }

  return bestPos;
}

function overlapMixToOutput(
  overlapBuf,
  inData,
  inFramePos,
  outData,
  outFramePos,
  overlap,
  channels,
) {
  const fadeStep = 1 / Math.max(1, overlap);

  for (let frame = 0; frame < overlap; frame += 1) {
    const fadeIn = fadeStep * frame;
    const fadeOut = 1 - fadeIn;
    const inBase = (inFramePos + frame) * channels;
    const outBase = (outFramePos + frame) * channels;
    const ovBase = frame * channels;

    for (let ch = 0; ch < channels; ch += 1) {
      const a = overlapBuf[ovBase + ch] || 0;
      const b = inData[inBase + ch] || 0;
      outData[outBase + ch] = a * fadeOut + b * fadeIn;
    }
  }
}

function copyFrames(
  inData,
  inFramePos,
  outData,
  outFramePos,
  frames,
  channels,
) {
  if (frames <= 0) {
    return;
  }

  const inStart = inFramePos * channels;
  const outStart = outFramePos * channels;
  outData.set(inData.subarray(inStart, inStart + frames * channels), outStart);
}

function interleavedToAudioBuffer(
  audioContext,
  interleaved,
  channels,
  sampleRate,
  frames,
) {
  const output = audioContext.createBuffer(channels, frames, sampleRate);

  for (let ch = 0; ch < channels; ch += 1) {
    const channelData = output.getChannelData(ch);
    for (let frame = 0; frame < frames; frame += 1) {
      channelData[frame] = interleaved[frame * channels + ch] || 0;
    }
  }

  return output;
}

export function createWsolaStretchedBufferFromSample(
  audioContext,
  sampleBuffer,
  readDurationSec,
  factor,
  quickSearch,
) {
  const sampleRate = Math.max(
    8000,
    Number(sampleBuffer?.sampleRate || audioContext?.sampleRate || 44100),
  );
  const channels = Math.max(1, Number(sampleBuffer?.numberOfChannels || 1));
  const readFrames = clamp(
    Math.floor(Number(readDurationSec || 0) * sampleRate),
    16,
    Number(sampleBuffer?.length || 16),
  );

  if (!audioContext || !sampleBuffer || readFrames <= 32) {
    return sampleBuffer;
  }

  const params = buildKaliParams(sampleRate, factor);
  if (readFrames < params.processSize + params.overlap) {
    return sampleBuffer;
  }

  const inputData = buildInterleavedInput(sampleBuffer, readFrames);
  const expectedOutFrames = Math.max(
    32,
    Math.floor(readFrames / params.factor + 0.5),
  );
  const outCapacityFrames = Math.max(
    expectedOutFrames + params.segment + params.overlap,
    readFrames * 2,
  );
  const outData = new Float32Array(outCapacityFrames * channels);
  const overlapBuf = new Float32Array(params.overlap * channels);

  let inputFramePos = 0;
  let outFramePos = 0;
  let segmentsTotal = 0;

  while (inputFramePos + params.processSize <= readFrames) {
    let offset = 0;

    if (segmentsTotal === 0) {
      offset = params.search >>> 1;
      copyFrames(
        inputData,
        inputFramePos + offset,
        outData,
        outFramePos,
        params.overlap,
        channels,
      );
      outFramePos += params.overlap;
    } else {
      offset = bestOverlapPosition(
        inputData,
        inputFramePos,
        overlapBuf,
        params,
        channels,
        Boolean(quickSearch),
      );
      overlapMixToOutput(
        overlapBuf,
        inputData,
        inputFramePos + offset,
        outData,
        outFramePos,
        params.overlap,
        channels,
      );
      outFramePos += params.overlap;
    }

    const middleFrames = Math.max(0, params.segment - 2 * params.overlap);
    copyFrames(
      inputData,
      inputFramePos + offset + params.overlap,
      outData,
      outFramePos,
      middleFrames,
      channels,
    );
    outFramePos += middleFrames;

    copyFrames(
      inputData,
      inputFramePos + offset + params.segment - params.overlap,
      overlapBuf,
      0,
      params.overlap,
      channels,
    );

    segmentsTotal += 1;
    const skip = Math.floor(
      params.factor * (params.segment - params.overlap) + 0.5,
    );
    inputFramePos += Math.max(1, skip);

    if (outFramePos + params.segment >= outCapacityFrames) {
      break;
    }
  }

  const producedFrames = Math.max(0, Math.min(outFramePos, expectedOutFrames));
  if (producedFrames < 32) {
    return sampleBuffer;
  }

  return interleavedToAudioBuffer(
    audioContext,
    outData,
    channels,
    sampleRate,
    producedFrames,
  );
}
