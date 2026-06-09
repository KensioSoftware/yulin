import type { Readable } from "node:stream";

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
  readonly Bucket?: string;
  readonly Key?: string;
}

/**
 * Minimal structural sim S3 GetObject output.
 */
export interface SimGetObjectCommandOutput {
  readonly Body?: Readable;
  readonly Metadata?: Record<string, string>;
  readonly $metadata: Record<string, unknown>;
}
