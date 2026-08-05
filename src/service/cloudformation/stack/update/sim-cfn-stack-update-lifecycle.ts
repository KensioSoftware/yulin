import type { BackgroundScheduler } from "../../../../util/background/background.js";
import { SimCloudFormationValidationError } from "../../error/sim-cloudformation.error.js";
import type {
  SimCloudFormationStackName,
  SimCloudFormationStackStatus,
} from "../sim-cfn-stack.js";
import { SimCfnStackOperationScheduler } from "../sim-cfn-stack-operation-scheduler.js";

interface SimCfnStackUpdateLifecycleProperties {
  readonly background: BackgroundScheduler;
  readonly stackName: SimCloudFormationStackName;
}

/**
 * Owns the simulated CloudFormation Stack update lifecycle state.
 *
 * The third of the Stack operation lifecycles, alongside
 * SimCfnStackDeploymentLifecycle and SimCfnStackDeletionLifecycle, and separate
 * from both for the same reason they are separate from each other: a Stack that
 * was never updated has no update status at all, and its deployment status is
 * still the thing to report.
 *
 * The work itself is passed in per update, because each one applies a different
 * template. This class only says what the Stack is doing and what went wrong.
 */
export class SimCfnStackUpdateLifecycle {
  private readonly background: BackgroundScheduler;
  private readonly stackName: SimCloudFormationStackName;
  #status: SimCloudFormationStackStatus | undefined;

  private completePromise: Promise<void> | undefined;
  private updateError: Error | undefined;

  constructor(properties: SimCfnStackUpdateLifecycleProperties) {
    this.background = properties.background;
    this.stackName = properties.stackName;
  }

  /**
   * The current Stack update status, or undefined if the Stack has never been
   * updated.
   */
  public get status(): SimCloudFormationStackStatus | undefined {
    return this.#status;
  }

  /**
   * The error captured during a background update, if any.
   */
  public get error(): Error | undefined {
    return this.updateError;
  }

  /**
   * Refuse an update while one is already running.
   *
   * CloudFormation takes one update at a time, and a second here would read
   * the difference to apply from a Stack half way through the first.
   */
  assertNotUpdating(): void {
    if (this.#status === "UPDATE_IN_PROGRESS") {
      throw new SimCloudFormationValidationError(
        `Stack ${this.stackName} is in UPDATE_IN_PROGRESS state and can not be updated`,
      );
    }
  }

  /**
   * Start the Stack update lifecycle.
   *
   * The returned promise only covers sequencing and scheduling, as deployment
   * and deletion do. The Resource work continues in the background, so callers
   * that need the final state should use waitForComplete().
   *
   * An update that fails leaves the Stack in UPDATE_FAILED with the reason on
   * it. Sim CloudFormation does not roll the Stack back to the template it was
   * deployed from, so the Stack is left holding whatever the update managed.
   */
  public async update(runUpdate: () => Promise<void>): Promise<void> {
    this.#status = "UPDATE_IN_PROGRESS";
    this.updateError = undefined;

    const scheduler = new SimCfnStackOperationScheduler({
      background: this.background,
      failureMessage: "Sim CloudFormation Stack update failed",
    });

    await scheduler.sequence();

    this.completePromise = scheduler.schedule({
      operation: runUpdate,
      onSuccess: () => {
        this.#status = "UPDATE_COMPLETE";
      },
      onFailure: (error) => {
        this.#status = "UPDATE_FAILED";
        this.updateError = error;
      },
    });
  }

  /**
   * Wait for the scheduled update to finish.
   *
   * If the update failed, this rethrows the captured error, so a caller can see
   * what stopped the new template being applied. A Stack that was never updated
   * has nothing to wait for.
   */
  public async waitForComplete(): Promise<void> {
    if (this.completePromise !== undefined) {
      await this.completePromise;
    }

    if (this.updateError !== undefined) {
      throw this.updateError;
    }
  }
}
