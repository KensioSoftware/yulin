import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type {
  SimCloudFormationStackName,
  SimCloudFormationStackStatus,
} from "../sim-cfn-stack.js";
import { SimCfnStackDeploymentScheduler } from "./sim-cfn-stack-deployment-scheduler.js";

interface SimCfnStackDeploymentProps {
  readonly background: BackgroundScheduler;
  readonly stackName: SimCloudFormationStackName;

  /**
   * Actual Stack resource deployment work supplied by SimCfnStack.
   *
   * The lifecycle stores this callback so deploy() can remain a simple
   * lifecycle operation. Resource creation and dependency resolution stay
   * outside this class, while status/error/completion handling stays inside it.
   */
  readonly runDeployment: () => Promise<void>;
}

/**
 * Owns the simulated CloudFormation Stack deployment lifecycle state.
 *
 * This class is limited to Stack-level lifecycle concerns:
 *
 * - validating legal status transitions before deployment starts
 * - exposing the current Stack status
 * - remembering the scheduled deployment completion promise
 * - capturing any background deployment error
 * - rethrowing the captured error when callers wait for completion
 *
 * It does not interpret templates, resolve resource dependencies, create
 * resources, or choose background execution order. The injected runDeployment
 * callback performs the actual resource deployment, and
 * SimCfnStackDeploymentScheduler controls when that callback runs.
 */
export class SimCfnStackDeploymentLifecycle {
  private readonly background: BackgroundScheduler;
  private readonly stackName: SimCloudFormationStackName;
  private readonly runDeployment: () => Promise<void>;
  private _status: SimCloudFormationStackStatus = "REVIEW_IN_PROGRESS";

  private completePromise: Promise<void> | undefined;
  private deployError: Error | undefined;

  constructor(props: SimCfnStackDeploymentProps) {
    this.background = props.background;
    this.stackName = props.stackName;
    this.runDeployment = props.runDeployment;
  }

  /**
   * Get the current externally visible Stack status.
   *
   * The lifecycle starts in REVIEW_IN_PROGRESS. Calling deploy() moves it to
   * CREATE_IN_PROGRESS synchronously before resource deployment is scheduled.
   * The scheduled deployment task later moves it to CREATE_COMPLETE or
   * CREATE_FAILED.
   */
  public get status(): SimCloudFormationStackStatus {
    return this._status;
  }

  /**
   * Get the deployment error captured during background deployment, if any.
   *
   * Background tasks cannot throw directly to the original deploy() caller, so
   * failures are stored here when the scheduled deployment task finishes. Callers
   * that need synchronous failure observation should call waitForComplete().
   */
  public get error(): Error | undefined {
    return this.deployError;
  }

  /**
   * Start the Stack deployment lifecycle.
   *
   * This method validates the current lifecycle state, marks deployment as in
   * progress, clears any stale error, waits for earlier simulator background
   * work to sequence, and then schedules the injected resource deployment task.
   *
   * The returned promise only covers the sequencing and scheduling step. The
   * actual resource deployment continues in the background; use
   * waitForComplete() to wait for that scheduled work and rethrow any captured
   * deployment error.
   */
  public async deploy(): Promise<void> {
    if (this._status !== "REVIEW_IN_PROGRESS") {
      throw new Error(
        `Sim CloudFormation Stack ${this.stackName} cannot be deployed from ${this._status} status`,
      );
    }

    this._status = "CREATE_IN_PROGRESS";
    this.deployError = undefined;

    const scheduler = new SimCfnStackDeploymentScheduler({
      background: this.background,
      failureMessage: "Sim CloudFormation Stack deploy failed",
    });

    await scheduler.sequence();

    this.completePromise = scheduler.schedule({
      deploy: this.runDeployment,
      onSuccess: () => {
        this._status = "CREATE_COMPLETE";
      },
      onFailure: (error) => {
        this._status = "CREATE_FAILED";
        this.deployError = error;
      },
    });
  }

  /**
   * Wait for the scheduled deployment task to finish.
   *
   * If deployment has not been started, there is no completion promise and this
   * method returns immediately. If the background deployment failed, this
   * method rethrows the captured error after the scheduled task has settled.
   */
  public async waitForComplete(): Promise<void> {
    if (this.completePromise !== undefined) {
      await this.completePromise;
    }

    if (this.deployError !== undefined) {
      throw this.deployError;
    }
  }
}
