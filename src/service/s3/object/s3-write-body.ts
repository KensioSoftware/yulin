import type { Readable } from "node:stream";

/**
 * The request body forms a write can carry.
 *
 * This allows for the different types Body could be in the real SDK command,
 * even though the simulation will just use a Buffer internally.
 */
export type SimS3WriteBody =
  | string
  | Uint8Array
  | Buffer
  | Blob
  | Readable
  | ReadableStream<Uint8Array>
  | undefined;

/**
 * Materialize a supported SDK request body as the Buffer S3 stores.
 *
 * An omitted body represents an empty S3 Object, or an empty part of one.
 * Strings use Node.js's default UTF-8 encoding. Uint8Array input is copied into
 * a Buffer so storage receives one consistent binary representation and does
 * not depend on the caller's mutable typed-array instance.
 *
 * The simulation supports the request body forms used by its S3 boundary:
 * strings and Uint8Array values. Node.js Buffer values are also covered because
 * Buffer extends Uint8Array. Other SDK streaming body forms should be added
 * here when the simulation gains support for them.
 */
export function simS3WriteBodyBuffer(
  body: SimS3WriteBody,
  commandName: string,
): Buffer {
  if (body === undefined) {
    return Buffer.alloc(0);
  }

  if (typeof body === "string") {
    return Buffer.from(body);
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }

  throw new Error(`${commandName}.input.Body must be a string or Uint8Array`);
}
