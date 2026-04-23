import { useCallback, useRef } from "react";
import { toSafeSampleUrl } from "../../utils/sampleUrl";

/**
 * Manages asynchronous loading and in-memory caching of AudioBuffer samples.
 *
 * Samples are fetched once, decoded with the active AudioContext, and then
 * stored in a Map so that multiple channels or patterns can reuse the same
 * buffer without redundant network requests.
 *
 * @param {() => AudioContext} ensureContext
 */
export function useSampleBuffers(ensureContext) {
  const sampleBufferCacheRef = useRef(new Map());
  const sampleLoadPromiseRef = useRef(new Map());
  const sampleLoadFailedRef = useRef(new Set());

  const loadSampleBuffer = useCallback(
    async function (sampleRef) {
      const sampleUrl = toSafeSampleUrl(sampleRef);
      if (!sampleUrl) {
        return null;
      }

      const cached = sampleBufferCacheRef.current.get(sampleUrl);
      if (cached) {
        return cached;
      }

      const pending = sampleLoadPromiseRef.current.get(sampleUrl);
      if (pending) {
        return pending;
      }

      const request = (async function () {
        const audioCtx = ensureContext();
        const response = await fetch(sampleUrl);
        if (!response.ok) {
          throw new Error("Sample request failed");
        }

        const data = await response.arrayBuffer();
        const decodedBuffer = await audioCtx.decodeAudioData(data.slice(0));

        sampleBufferCacheRef.current.set(sampleUrl, decodedBuffer);
        sampleLoadFailedRef.current.delete(sampleUrl);
        return decodedBuffer;
      })();

      sampleLoadPromiseRef.current.set(sampleUrl, request);

      request.catch(function () {
        sampleLoadFailedRef.current.add(sampleUrl);
        sampleLoadPromiseRef.current.delete(sampleUrl);
      });

      return request;
    },
    [ensureContext],
  );

  return {
    sampleBufferCacheRef,
    sampleLoadPromiseRef,
    sampleLoadFailedRef,
    loadSampleBuffer,
  };
}
