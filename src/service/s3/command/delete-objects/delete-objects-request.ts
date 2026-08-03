import { assertDefined } from "../../../../util/type-guard/defined.js";
import { SimS3MalformedXml } from "../../error/sim-s3.error.js";
import type { SimDeleteObjectsRequest } from "./delete-objects.command.js";

/**
 * The most Objects real S3 accepts in one DeleteObjects request.
 */
const maximumKeys = 1000;

/**
 * The keys a DeleteObjects request names, and whether it asked to be quiet.
 *
 * Real S3 refuses the whole request before deleting anything when the document
 * it was sent is not one it accepts, so the limits are checked here rather than
 * reported per key.
 */
export class DeleteObjectsRequest {
  public readonly keys: readonly string[];
  public readonly quiet: boolean;

  constructor(request: SimDeleteObjectsRequest) {
    const objects = request.Objects ?? [];

    if (objects.length === 0) {
      throw new SimS3MalformedXml(
        "DeleteObjectsCommand.input.Delete.Objects names no Objects to delete",
      );
    }

    if (objects.length > maximumKeys) {
      throw new SimS3MalformedXml(
        `DeleteObjectsCommand.input.Delete.Objects names ` +
          `${String(objects.length)} Objects, and S3 deletes at most ` +
          `${String(maximumKeys)} in one request`,
      );
    }

    this.keys = objects.map((object) => {
      assertDefined(
        object.Key,
        "DeleteObjectsCommand.input.Delete.Objects Key",
      );

      return object.Key;
    });
    this.quiet = request.Quiet ?? false;
  }
}
