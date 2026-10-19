import type { SimS3Bucket } from "../../bucket/sim-s3-bucket.js";
import {
  SimS3NoSuchKey,
  SimS3NotImplemented,
  SimS3PreconditionFailed,
} from "../../error/sim-s3.error.js";
import { simS3UnquotedETag } from "../../object/s3-object-etag.js";

/**
 * The conditions a write can place on the Object already under its key.
 *
 * PutObject, CopyObject and CompleteMultipartUpload all take these, as the
 * `If-None-Match` and `If-Match` headers.
 *
 * https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html
 */
export interface SimS3WritePrecondition {
  readonly IfMatch?: string | undefined;
  readonly IfNoneMatch?: string | undefined;
}

/**
 * The message real S3 gives with `PreconditionFailed`.
 */
export const simS3PreconditionMessage =
  "At least one of the pre-conditions you specified did not hold";

/**
 * Refuse a write whose condition does not hold against the key's current
 * Object.
 *
 * `If-None-Match: *` fails when the key holds an Object. `If-Match` fails when
 * the Object's ETag differs, and answers `NoSuchKey` when the key holds
 * nothing. A delete marker counts as nothing, because a read of the key finds
 * nothing behind it. Real S3 accepts only `*` for `If-None-Match` on a write.
 */
export async function simS3RequireWritePrecondition(
  bucket: SimS3Bucket,
  key: string,
  condition: SimS3WritePrecondition,
): Promise<void> {
  const { IfMatch, IfNoneMatch } = condition;

  if (IfMatch === undefined && IfNoneMatch === undefined) {
    return;
  }

  if (IfNoneMatch !== undefined && IfNoneMatch !== "*") {
    throw new SimS3NotImplemented(
      `A header you provided implies functionality that is not implemented. ` +
        `If-None-Match on a write takes only *.`,
    );
  }

  const current = await bucket.getObject(key);

  if (IfNoneMatch !== undefined && current !== undefined) {
    throw new SimS3PreconditionFailed(simS3PreconditionMessage);
  }

  if (IfMatch === undefined) {
    return;
  }

  if (current === undefined) {
    throw new SimS3NoSuchKey(`No S3 Object named ${key}`);
  }

  if (!simS3ETagMatches(IfMatch, current.etag)) {
    throw new SimS3PreconditionFailed(simS3PreconditionMessage);
  }
}

/**
 * Whether an entity tag a client sent names an Object's ETag.
 *
 * `*` names any Object. A client sends back the ETag it was given, quotes and
 * all, so both forms are accepted.
 */
export function simS3ETagMatches(sent: string, etag: string): boolean {
  return sent.trim() === "*" || simS3UnquotedETag(sent).trim() === etag;
}
