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
 */
export interface SimGetObjectCommandOutput {
  readonly Body?: Readable;
  readonly Metadata?: Record<string, string>;
  readonly $metadata: SimResponseMetadata;
}
