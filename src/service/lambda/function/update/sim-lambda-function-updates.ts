import type { BackgroundScheduler } from "../../../../util/background/background.js";
import { randomUUID } from "node:crypto";

import {
  SimLambdaPreconditionFailedException,
  SimLambdaResourceConflictException,
} from "../../error/sim-lambda.error.js";

/**
 * The status of the last change made to a function's code or settings.
 *
 * `Failed` belongs to an update real Lambda could not apply, which nothing
 * here produces.
 */
export type SimLambdaLastUpdateStatus = "InProgress" | "Successful";

/**
 * Where a function stands with the changes made to it, as real Lambda reports
 * it in `LastUpdateStatus`.
 *
 * An update reports `InProgress` until the simulation's background work has
 * run, and `Successful` after. Real Lambda refuses another change while one is
 * in progress, and the check that refuses lives here beside the status it
 * reads.
 *
 * Real Lambda also refuses a change to a function still `Pending` after its
 * creation. That refusal is left out. Publishing a version straight after
 * creating a function is how CloudFormation's own version and edge paths run
 * here, and nothing in them waits for the function to become `Active`.
 */
export class SimLambdaFunctionUpdates {
  #status: SimLambdaLastUpdateStatus = "Successful";
  #revisionId = randomUUID();

  /**
   * The status the function reports.
   */
  get status(): SimLambdaLastUpdateStatus {
    return this.#status;
  }

  /**
   * The revision the function is at, which every change moves on. A request
   * naming a `RevisionId` changes the function only while it is still at that
   * revision.
   */
  get revisionId(): string {
    return this.#revisionId;
  }

  /**
   * Refuse a change to the function while an earlier change is in progress,
   * or when the request names a revision the function has moved on from, the
   * way real Lambda refuses either.
   */
  assertIdle(functionArn: string, revisionId?: string): void {
    if (revisionId !== undefined && revisionId !== this.#revisionId) {
      throw new SimLambdaPreconditionFailedException(
        "The Revision Id provided does not match the latest Revision Id. " +
          "Call the GetFunction/GetAlias API to retrieve the latest Revision Id",
      );
    }

    if (this.#status === "InProgress") {
      throw new SimLambdaResourceConflictException(
        "The operation cannot be performed at this time. An update is in " +
          `progress for resource: ${functionArn}`,
      );
    }
  }

  /**
   * Start a change, which settles once the simulation's background work has
   * run.
   */
  begin(
    functionArn: string,
    background: BackgroundScheduler,
    revisionId?: string,
  ): void {
    this.assertIdle(functionArn, revisionId);
    this.#status = "InProgress";
    this.#revisionId = randomUUID();

    background.schedule(() => {
      this.#status = "Successful";

      return Promise.resolve();
    });
  }
}
