import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim S3 DeleteObjects command.
 */
export interface SimDeleteObjectsCommand {
  readonly input: SimDeleteObjectsCommandInput;
}

/**
 * Minimal structural sim S3 DeleteObjects input.
 */
export interface SimDeleteObjectsCommandInput {
  readonly Bucket?: string | undefined;
  readonly Delete?: SimDeleteObjectsRequest | undefined;
}

/**
 * The Objects one DeleteObjects request asks to remove.
 *
 * `Quiet` asks S3 to report only the keys it could not remove, which is what
 * bulk cleanup code usually wants.
 */
export interface SimDeleteObjectsRequest {
  readonly Objects?: readonly SimS3ObjectIdentifier[] | undefined;
  readonly Quiet?: boolean | undefined;
}

/**
 * One Object named in a DeleteObjects request.
 */
export interface SimS3ObjectIdentifier {
  readonly Key?: string | undefined;
}

/**
 * Minimal structural sim S3 DeleteObjects output.
 */
export interface SimDeleteObjectsCommandOutput {
  readonly Deleted?: readonly SimS3DeletedObject[];
  readonly Errors?: readonly SimS3DeleteObjectsError[];
  readonly $metadata: SimResponseMetadata;
}

/**
 * One Object a DeleteObjects request removed.
 *
 * A versioned Bucket hides the Object behind a marker instead of removing it,
 * and reports the marker it wrote under `DeleteMarker` and
 * `DeleteMarkerVersionId`. A Bucket without versioning carries neither.
 */
export interface SimS3DeletedObject {
  readonly Key: string;
  readonly DeleteMarker?: boolean | undefined;
  readonly DeleteMarkerVersionId?: string | undefined;
}

/**
 * One Object a DeleteObjects request could not remove.
 */
export interface SimS3DeleteObjectsError {
  readonly Key: string;
  readonly Code: string;
  readonly Message: string;
}
