import { Readable } from "node:stream";
import { buffer } from "node:stream/consumers";
import type { ReadableStream } from "node:stream/web";
import { SimSdkStreamAlreadyConsumedError } from "../error/sim-sdk.error.js";

/**
 * The transform methods the real AWS SDK mixes into streaming output payloads
 * such as the S3 GetObject Body.
 */
export interface SimSdkStreamBodyMethods {
  transformToByteArray(): Promise<Uint8Array>;
  transformToString(encoding?: BufferEncoding): Promise<string>;
  transformToWebStream(): ReadableStream<Uint8Array>;
}

/**
 * A simulated SDK streaming output payload: a Readable with the SDK stream
 * transform methods mixed in.
 */
export type SimSdkStreamBody = Readable & SimSdkStreamBodyMethods;

/**
 * Mix the SDK stream transform methods into a simulated streaming output
 * payload.
 *
 * Matches real SDK behaviour: the payload can only be consumed once, whether
 * through a transform method or by reading the stream directly.
 */
export function simSdkStreamBody(body: Readable): SimSdkStreamBody {
  let consumed = false;
  const consume = (): Readable => {
    if (consumed) {
      throw new SimSdkStreamAlreadyConsumedError(
        "Simulated SDK stream body was already consumed and cannot be " +
          "transformed again",
      );
    }
    consumed = true;
    return body;
  };

  const methods: SimSdkStreamBodyMethods = {
    async transformToByteArray(): Promise<Uint8Array> {
      return new Uint8Array(await buffer(consume()));
    },
    async transformToString(encoding?: BufferEncoding): Promise<string> {
      const bytes = await buffer(consume());
      return bytes.toString(encoding);
    },
    transformToWebStream(): ReadableStream<Uint8Array> {
      return Readable.toWeb(consume()) as ReadableStream<Uint8Array>;
    },
  };

  return Object.assign(body, methods);
}
