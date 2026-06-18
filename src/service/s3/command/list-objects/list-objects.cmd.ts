/**
 * Minimal structural sim S3 ListObjects command.
 */
export interface SimListObjectsCommand {
  readonly input: SimListObjectsCommandInput;
}

/**
 * Minimal structural sim S3 ListObjects input.
 */
export interface SimListObjectsCommandInput {
  readonly Bucket?: string | undefined;
  readonly Prefix?: string | undefined;
  readonly Marker?: string | undefined;
  readonly MaxKeys?: number | undefined;
}

/**
 * Minimal structural sim S3 ListObjects output.
 */
export interface SimListObjectsCommandOutput {
  readonly Contents?: SimS3ObjectSummary[];
  readonly Name?: string;
  readonly Prefix?: string | undefined;
  readonly Marker?: string | undefined;
  readonly MaxKeys?: number;
  readonly IsTruncated?: boolean;
  readonly NextMarker?: string | undefined;
  readonly $metadata: Record<string, unknown>;
}

/**
 * Minimal structural sim S3 object summary.
 */
export interface SimS3ObjectSummary {
  readonly Key?: string;
  readonly Size?: number;
}
