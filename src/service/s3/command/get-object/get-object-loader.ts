import { Readable } from "node:stream";
import type { SimS3Bucket } from "../../bucket/sim-s3-bucket.js";
import { SimS3NoSuchKey } from "../../error/sim-s3.error.js";
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
 * - a missing storage entry becomes the S3 NoSuchKey error;
 * - the stored Buffer becomes the readable response body;
 * - stored metadata becomes SDK response metadata.
 *
 * Bucket resolution remains in the command handler because AWS request ordering
 * requires a missing Bucket to be reported before Object authorization.
 */
export class GetObjectLoader {
  /**
   * Read an Object from the resolved Bucket and build its SDK command output.
   */
  async load(
    bucket: SimS3Bucket,
    key: string,
  ): Promise<SimGetObjectCommandOutput> {
    const object = await bucket.getObject(key);
    if (object === undefined) {
      throw new SimS3NoSuchKey(`No S3 Object named ${key}`);
    }

    return {
      Body: Readable.from([object.body]),
      Metadata: object.metadata.values,
      $metadata: {},
    };
  }
}
