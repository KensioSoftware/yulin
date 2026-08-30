import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { SimS3Error } from "../../error/sim-s3.error.js";
import type { DeleteObjectAttempt } from "./delete-object-attempt.js";
import type {
  SimDeleteObjectsCommandOutput,
  SimS3DeletedObject,
  SimS3DeleteObjectsError,
} from "./delete-objects.command.js";

/**
 * What a DeleteObjects request did to each key it named.
 *
 * A batch deletion is not all or nothing in real S3: a key it cannot remove is
 * reported in the response while the rest are still deleted, so the failures
 * are collected here rather than raised.
 */
export class DeleteObjectsOutcome {
  private readonly deleted: SimS3DeletedObject[] = [];
  private readonly errors: SimS3DeleteObjectsError[] = [];

  constructor(attempts: readonly DeleteObjectAttempt[]) {
    for (const attempt of attempts) {
      this.record(attempt);
    }
  }

  /**
   * Build the DeleteObjects response.
   *
   * A quiet request asks for the failures alone, and real S3 leaves an empty
   * list out of the response rather than sending it empty.
   */
  toOutput(quiet: boolean): SimDeleteObjectsCommandOutput {
    return {
      ...(!quiet && this.deleted.length > 0 && { Deleted: this.deleted }),
      ...(this.errors.length > 0 && { Errors: this.errors }),
      $metadata: {},
    };
  }

  /**
   * Sort one attempt into the deletions or the failures.
   */
  private record(attempt: DeleteObjectAttempt): void {
    if (attempt.error === undefined) {
      this.deleted.push({
        Key: attempt.key,
        // Reported per key, as real S3 does, so a caller can tell which keys
        // of the batch were hidden behind a marker rather than removed.
        ...(attempt.deleteMarker !== undefined && {
          DeleteMarker: true,
          DeleteMarkerVersionId: attempt.deleteMarker.versionId,
        }),
      });
      return;
    }

    this.recordFailure(attempt.key, attempt.error);
  }

  /**
   * Report why a key was not removed.
   *
   * Only failures S3 itself has a code for are reported. Anything the simulator
   * does not recognise is re-raised, so a bug in the simulation cannot arrive
   * as a per-key AWS error the test then asserts on.
   */
  private recordFailure(key: string, error: unknown): void {
    if (error instanceof SimIamAccessDenied) {
      this.errors.push({
        Key: key,
        Code: "AccessDenied",
        Message: error.message,
      });
      return;
    }

    if (error instanceof SimS3Error) {
      this.errors.push({ Key: key, Code: error.name, Message: error.message });
      return;
    }

    throw error;
  }
}
