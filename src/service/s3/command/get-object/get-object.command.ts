import type { Readable } from "node:stream";
import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim S3 GetObject command.
 */
export interface SimGetObjectCommand {
  readonly input: SimGetObjectCommandInput;
}

/**
 * Minimal structural sim S3 GetObject input.
 */
export interface SimGetObjectCommandInput {
  readonly Bucket?: string | undefined;
  readonly Key?: string | undefined;
  /**
   * The bytes of the Object to read, as an HTTP `Range` header: `bytes=0-499`,
   * `bytes=500-` or `bytes=-500`. A read that states no range reads the whole
   * Object.
   */
  readonly Range?: string | undefined;
}

/**
 * Minimal structural sim S3 GetObject output.
 *
 * `ETag` is quoted, as real S3 and the SDK give it. `LastModified` is when the
 * Object was written, by the simulation's clock.
 *
 * `ContentLength` describes the body being sent rather than the Object, so a
 * ranged read reports the size of its slice. `ContentRange` says which bytes
 * of the Object those are, and is set only for a read that asked for some of
 * them.
 */
export interface SimGetObjectCommandOutput {
  readonly Body?: Readable;
  readonly Metadata?: Record<string, string>;
  readonly ETag?: string;
  readonly LastModified?: Date;
  readonly ContentLength?: number;
  readonly ContentRange?: string;
  readonly $metadata: SimResponseMetadata;
}
