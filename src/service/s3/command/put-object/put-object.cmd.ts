import type { Readable } from "node:stream";

/**
 * Minimal structural sim S3 PutObject command.
 */
export interface SimPutObjectCommand {
  readonly input: SimPutObjectCommandInput;
}

/**
 * Minimal structural sim S3 PutObject input.
 */
export interface SimPutObjectCommandInput {
  readonly Bucket?: string | undefined;
  readonly Key?: string | undefined;
  readonly Body?: SimPutObjectBody;
  readonly Metadata?: Record<string, string> | undefined;
  readonly ContentType?: string | undefined;
}

/**
 * Minimal structural sim S3 PutObject output.
 */
export interface SimPutObjectCommandOutput {
  readonly $metadata: Record<string, unknown>;
}

/**
 * Minimal supported sim S3 PutObject body type.
 * This allows for different types that Body could be in the real SDK command,
 * even though we will just use Readable internally.
 */
export type SimPutObjectBody =
  | string
  | Uint8Array
  | Buffer
  | Blob
  | Readable
  | ReadableStream<Uint8Array>
  | undefined;
