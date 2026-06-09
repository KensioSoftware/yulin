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
  readonly Bucket?: string;
  readonly Key?: string;
  readonly Body?: SimPutObjectBody;
  readonly Metadata?: Record<string, string>;
  readonly ContentType?: string;
}

/**
 * Minimal structural sim S3 PutObject output.
 */
export interface SimPutObjectCommandOutput {
  readonly $metadata: Record<string, unknown>;
}

/**
 * Minimal supported sim S3 PutObject body type.
 */
export type SimPutObjectBody = string | Uint8Array | undefined;
