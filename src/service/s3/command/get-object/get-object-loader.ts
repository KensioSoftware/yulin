import { Readable } from "node:stream";
import type { SimS3Bucket } from "../../bucket/sim-s3-bucket.js";
import { SimS3NoSuchKey } from "../../error/sim-s3.error.js";
import { simS3QuotedETag } from "../../object/s3-object-etag.js";
import {
  simS3ContentRange,
  simS3ReadObjectRange,
} from "../../object/s3-object-range.js";
import { simS3ReadObjectVersion } from "../object/sim-s3-read-object-version.js";
import type { SimGetObjectCommandOutput } from "./get-object.command.js";

/**
 * Loads an authorized S3 Object and converts it to a GetObject response.
 *
 * The command handler performs IAM authorization before calling this class.
 * Keeping Object lookup behind that authorization boundary prevents denied
 * callers from learning whether a key exists.
 *
 * This class owns both storage lookup and response conversion because the SDK
 * response is a representation of the stored Object:
 *
 * - a missing storage entry becomes the S3 NoSuchKey error, and a `VersionId`
 *   naming a version the Bucket never issued becomes NoSuchVersion;
 * - the stored Buffer, or the part of it the read asked for, becomes the
 *   readable response body;
 * - what S3 was told about the Object becomes the response's own fields, and
 *   what the caller attached to it becomes the response metadata;
 * - the Object's content hash and write time become its ETag and LastModified.
 *
 * Bucket resolution remains in the command handler because AWS request ordering
 * requires a missing Bucket to be reported before Object authorization.
 */
export class GetObjectLoader {
  /**
   * Read an Object, or the range of it that was asked for, from the resolved
   * Bucket, and build its SDK command output.
   */
  async load(
    bucket: SimS3Bucket,
    key: string,
    rangeHeader?: string,
    versionId?: string,
  ): Promise<SimGetObjectCommandOutput> {
    const read = await simS3ReadObjectVersion(bucket, key, versionId);
    if (read === undefined) {
      throw new SimS3NoSuchKey(`No S3 Object named ${key}`);
    }

    const object = read.object;

    const size = object.body.length;
    const range = simS3ReadObjectRange(rangeHeader, size);
    const body =
      range === undefined
        ? object.body
        : object.body.subarray(range.start, range.end + 1);

    return {
      ...object.metadata.system,
      Body: Readable.from([body]),
      Metadata: object.metadata.userDefined,
      // The ETag identifies the Object rather than the bytes being sent. A
      // client reading it in pieces compares the value across them to see
      // whether the Object changed underneath it.
      ETag: simS3QuotedETag(object.etag),
      LastModified: object.lastModified,
      ContentLength: body.length,
      ...(read.versionId !== undefined && { VersionId: read.versionId }),
      ...(range !== undefined && {
        ContentRange: simS3ContentRange(range, size),
      }),
      $metadata: {},
    };
  }
}
