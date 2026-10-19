import { SimS3PreconditionFailed } from "../../error/sim-s3.error.js";
import type { SimS3Object } from "../../object/s3-object.js";
import {
  simS3ETagMatches,
  simS3PreconditionMessage,
} from "../object/sim-s3-write-precondition.js";

/**
 * The conditions a copy can place on its source Object, as the
 * `x-amz-copy-source-if-*` headers.
 */
export interface SimS3CopySourcePrecondition {
  readonly CopySourceIfMatch?: string | undefined;
  readonly CopySourceIfNoneMatch?: string | undefined;
  readonly CopySourceIfModifiedSince?: Date | undefined;
  readonly CopySourceIfUnmodifiedSince?: Date | undefined;
}

/**
 * Refuse a copy whose source Object fails one of its conditions.
 *
 * Real S3 follows RFC 7232 here. An ETag condition takes precedence over the
 * date condition paired with it, so a source that matches `if-match` is copied
 * however recently it changed, and a source that fails `if-none-match` is
 * refused however long ago it changed. HTTP dates carry whole seconds, and the
 * Object's last-modified time is compared at that precision.
 *
 * https://docs.aws.amazon.com/AmazonS3/latest/API/API_CopyObject.html
 */
export function simS3RequireCopySourcePrecondition(
  source: SimS3Object,
  condition: SimS3CopySourcePrecondition,
): void {
  if (!sourceConditionsHold(source, condition)) {
    throw new SimS3PreconditionFailed(simS3PreconditionMessage);
  }
}

function sourceConditionsHold(
  source: SimS3Object,
  condition: SimS3CopySourcePrecondition,
): boolean {
  const modified = wholeSeconds(source.lastModified);
  const {
    CopySourceIfMatch: ifMatch,
    CopySourceIfNoneMatch: ifNoneMatch,
    CopySourceIfModifiedSince: ifModifiedSince,
    CopySourceIfUnmodifiedSince: ifUnmodifiedSince,
  } = condition;

  const matchHolds =
    ifMatch === undefined
      ? ifUnmodifiedSince === undefined ||
        modified <= wholeSeconds(ifUnmodifiedSince)
      : simS3ETagMatches(ifMatch, source.etag);

  const noneMatchHolds =
    ifNoneMatch === undefined
      ? ifModifiedSince === undefined ||
        modified > wholeSeconds(ifModifiedSince)
      : !simS3ETagMatches(ifNoneMatch, source.etag);

  return matchHolds && noneMatchHolds;
}

function wholeSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}
