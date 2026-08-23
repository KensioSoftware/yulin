import type { SimS3Bucket } from "../../bucket/sim-s3-bucket.js";
import { SimS3NotFound } from "../../error/sim-s3.error.js";
import { simS3QuotedETag } from "../../object/s3-object-etag.js";
import type { SimHeadObjectCommandOutput } from "./head-object.command.js";

/**
 * Describes an authorized S3 Object without reading it out.
 *
 * The command handler authorizes before calling this, which is what keeps a
 * denied caller from learning whether a key exists. What comes back is what a
 * read would have said about the Object, with the length it would have sent in
 * place of the body itself.
 */
export class HeadObjectLoader {
  /**
   * Describe an Object in the resolved Bucket.
   */
  async describe(
    bucket: SimS3Bucket,
    key: string,
  ): Promise<SimHeadObjectCommandOutput> {
    const object = await bucket.getObject(key);
    if (object === undefined) {
      throw new SimS3NotFound(`No S3 Object named ${key}`);
    }

    return {
      ...object.metadata.system,
      ContentLength: object.body.length,
      Metadata: object.metadata.userDefined,
      ETag: simS3QuotedETag(object.etag),
      LastModified: object.lastModified,
      $metadata: {},
    };
  }
}
