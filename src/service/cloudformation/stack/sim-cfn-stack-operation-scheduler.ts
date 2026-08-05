import type { BackgroundScheduler } from "../../../util/background/background.js";

interface SimCfnStackOperationSchedulerProperties {
  readonly background: BackgroundScheduler;
  readonly failureMessage: string;
}

interface ScheduleOperationProperties {
  readonly operation: () => Promise<void>;
  readonly onSuccess: () => void;
  readonly onFailure: (error: Error) => void;
}

/**
 * Coordinates when a whole-Stack operation runs on the background scheduler.
 *
 * Stack deployment and Stack deletion both start quickly and finish later, so
 * both are scheduled the same way. This class does not create or delete
 * CloudFormation Resources, resolve Resource dependencies, or update Stack
 * lifecycle state. SimCfnStackResourceCreator and SimCfnStackResourceDeleter
 * own dependency-ordered Resource work, while the deployment and deletion
 * lifecycles own Stack status, completion tracking, and captured errors.
 *
 * This scheduler only wraps an operation with background scheduling, completion
 * notification callbacks, and consistent non-Error conversion.
 */
export class SimCfnStackOperationScheduler {
  private readonly background: BackgroundScheduler;
  private readonly failureMessage: string;

  constructor(properties: SimCfnStackOperationSchedulerProperties) {
    const { background, failureMessage } = properties;

    this.background = background;
    this.failureMessage = failureMessage;
  }

  /**
   * Wait for already-scheduled background work before starting this operation.
   *
   * A simulated Stack operation should begin only after previously queued
   * background tasks have had a chance to run, matching the broader simulator's
   * deterministic sequencing model.
   */
  async sequence(): Promise<void> {
    await this.background.sequence();
  }

  /**
   * Schedule the supplied operation and return a promise for its completion.
   *
   * The supplied `operation` callback performs the actual Stack work. This
   * scheduler only decides when that callback runs, then reports the outcome
   * via onSuccess or onFailure so the Stack can update its own status.
   */
  schedule(properties: ScheduleOperationProperties): Promise<void> {
    const { operation, onSuccess, onFailure } = properties;

    return new Promise<void>((resolve) => {
      this.background.schedule(async () => {
        try {
          await operation();
          onSuccess();
        } catch (error) {
          onFailure(this.operationError(error));
        } finally {
          resolve();
        }
      });
    });
  }

  private operationError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }

    /* v8 ignore next -- redundant fallback */
    return new Error(`${this.failureMessage}: ${String(error)}`);
  }
}
