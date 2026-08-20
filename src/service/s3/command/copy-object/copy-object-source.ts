import type {
  SimS3Bucket,
  SimS3BucketName,
} from "../../bucket/sim-s3-bucket.js";
import {
  SimS3InvalidArgument,
  SimS3InvalidRequest,
  SimS3NoSuchKey,
  SimS3NotImplemented,
} from "../../error/sim-s3.error.js";
import type { SimS3Object } from "../../object/s3-object.js";

/**
 * The Object a copy reads from.
 */
export interface SimS3CopySource {
  readonly bucketName: SimS3BucketName;
  readonly key: string;
}

/**
 * Read a `CopySource` as the Bucket and key it names.
 *
 * Real S3 takes the source as `sourceBucket/sourceKey`, URL-encoded, and
 * accepts a leading slash on it. Everything after the first slash is the key,
 * because a key can hold slashes of its own. Each segment is decoded on its
 * own, the way the REST endpoint decodes a key out of a request path. A source
 * with nothing encoded in it comes through unchanged.
 *
 * https://docs.aws.amazon.com/AmazonS3/latest/API/API_CopyObject.html
 */
export function simS3CopySource(source: string): SimS3CopySource {
  const [path, versionId] = splitVersionId(source);

  if (versionId !== undefined) {
    throw new SimS3NotImplemented(
      `The CopySource ${source} names a versionId. Simulated S3 does not ` +
        `model Object versions.`,
    );
  }

  const segments = path.replace(/^\//, "").split("/").map(decodeSegment);
  const [bucketName, ...keySegments] = segments;
  const key = keySegments.join("/");

  if (bucketName === undefined || bucketName === "" || key === "") {
    throw new SimS3InvalidArgument(
      `The CopySource ${source} does not name a Bucket and an Object key.`,
    );
  }

  return { bucketName: bucketName as SimS3BucketName, key };
}

/**
 * Separate the version a source asks for from the Object it names.
 */
function splitVersionId(source: string): [string, string | undefined] {
  const marker = source.indexOf("?versionId=");

  if (marker === -1) {
    return [source, undefined];
  }

  return [source.slice(0, marker), source.slice(marker + "?versionId=".length)];
}

/**
 * Decode one segment of a source, leaving a segment that was never encoded as
 * it is.
 *
 * A stray percent sign makes `decodeURIComponent` throw, and real S3 answers
 * `InvalidArgument` for a source it cannot read.
 */
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    throw new SimS3InvalidArgument(
      `The CopySource segment ${segment} is not URL-encoded.`,
    );
  }
}

/**
 * Read the Object a copy takes its bytes from.
 *
 * The caller has already been authorized to read it. That is what keeps a
 * refused caller from learning whether the key exists.
 */
export async function simS3CopySourceObject(
  bucket: SimS3Bucket,
  key: string,
): Promise<SimS3Object> {
  const object = await bucket.getObject(key);

  if (object === undefined) {
    throw new SimS3NoSuchKey(`No S3 Object named ${key}`);
  }

  return object;
}

/**
 * Refuse a copy that would write an Object back over itself unchanged.
 *
 * Real S3 treats this as a request that cannot mean what it says, because the
 * copy would leave the Object exactly as it found it. `REPLACE` gives it a
 * meaning. It rewrites the Object's metadata in place.
 */
export function simS3RefuseUnchangedSelfCopy(
  source: SimS3CopySource,
  destination: SimS3CopySource,
  metadataDirective: string | undefined,
): void {
  const sameObject =
    source.key === destination.key &&
    source.bucketName === destination.bucketName;

  if (sameObject && metadataDirective !== "REPLACE") {
    throw new SimS3InvalidRequest(
      `This copy request is illegal because it is trying to copy an object ` +
        `to itself without changing the object's metadata.`,
    );
  }
}
