import type { BackgroundScheduler } from "../../../../util/background/background.js";

interface SimCfnStackDeploymentSchedulerProps {
  readonly background: BackgroundScheduler;
  readonly failureMessage: string;
}

interface ScheduleDeploymentProps {
  readonly deploy: () => Promise<void>;
  readonly onSuccess: () => void;
  readonly onFailure: (error: Error) => void;
}

/**
 * Coordinates when Stack deployment work runs on the background scheduler.
 *
 * This class does not create CloudFormation resources, resolve resource
 * dependencies, or update Stack lifecycle state. SimCfnStackResourceCreator
 * owns dependency-ordered Resource creation, while
 * SimCfnStackDeploymentLifecycle owns Stack status, completion tracking, and
 * captured deployment errors.
 *
 * This scheduler only wraps a deployment task with background scheduling,
 * completion notification callbacks, and consistent non-Error conversion.
 */
export class SimCfnStackDeploymentScheduler {
  private readonly background: BackgroundScheduler;
  private readonly failureMessage: string;

  constructor(props: SimCfnStackDeploymentSchedulerProps) {
    const { background, failureMessage } = props;

    this.background = background;
    this.failureMessage = failureMessage;
  }

  /**
   * Wait for already-scheduled background work before starting this deployment.
   *
   * Simulated Stack deployment should begin only after previously queued
   * background tasks have had a chance to run, matching the broader simulator's
   * deterministic sequencing model.
   */
  async sequence(): Promise<void> {
    await this.background.sequence();
  }

  /**
   * Schedule the supplied deployment task and return a promise for its
   * completion.
   *
   * The supplied `deploy` callback performs the actual Stack deployment work.
   * This scheduler only decides when that callback runs, then reports the
   * outcome via onSuccess or onFailure so the Stack can update its own status.
   */
  schedule(props: ScheduleDeploymentProps): Promise<void> {
    const { deploy, onSuccess, onFailure } = props;

    return new Promise<void>((resolve) => {
      this.background.schedule(async () => {
        try {
          await deploy();
          onSuccess();
        } catch (error) {
          onFailure(this.deploymentError(error));
        } finally {
          resolve();
        }
      });
    });
  }

  private deploymentError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }

    /* v8 ignore next -- redundant fallback */
    return new Error(`${this.failureMessage}: ${String(error)}`);
  }
}
