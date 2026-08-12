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
}

/**
 * Minimal structural sim S3 GetObject output.
 *
 * `ETag` is quoted, as real S3 and the SDK give it. `LastModified` is when the
 * Object was written, by the simulation's clock.
 */
export interface SimGetObjectCommandOutput {
  readonly Body?: Readable;
  readonly Metadata?: Record<string, string>;
  readonly ETag?: string;
  readonly LastModified?: Date;
  readonly $metadata: SimResponseMetadata;
}
