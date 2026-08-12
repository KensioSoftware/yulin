import type { Readable } from "node:stream";
import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim S3 PutObject command.
 */
export interface SimPutObjectCommand {
  readonly input: SimPutObjectCommandInput;
}

/**
 * Minimal structural sim S3 PutObject input.
 *
 * The fields below `Metadata` are the system metadata headers S3 remembers
 * about an Object and returns on a read. There is one for every entry in
 * `simS3SystemMetadataHeaders`, which is what the builder reads them by, so a
 * header added to that list without a field here fails to compile. `Expires` is
 * a `Date` because the SDK takes one and formats it as an HTTP date.
 */
export interface SimPutObjectCommandInput {
  readonly Bucket?: string | undefined;
  readonly Key?: string | undefined;
  readonly Body?: SimPutObjectBody;
  readonly Metadata?: Record<string, string> | undefined;
  readonly CacheControl?: string | undefined;
  readonly ContentDisposition?: string | undefined;
  readonly ContentEncoding?: string | undefined;
  readonly ContentLanguage?: string | undefined;
  readonly ContentType?: string | undefined;
  readonly Expires?: Date | undefined;
}

/**
 * Minimal structural sim S3 PutObject output.
 *
 * `ETag` is the quoted MD5 of the body S3 has just stored, which is what a
 * caller keeps to recognise the same content later without reading it back.
 */
export interface SimPutObjectCommandOutput {
  readonly ETag?: string;
  readonly $metadata: SimResponseMetadata;
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
