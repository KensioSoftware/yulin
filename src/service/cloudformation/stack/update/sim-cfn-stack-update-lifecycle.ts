import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type {
  SimCloudFormationStackName,
  SimCloudFormationStackStatus,
} from "../sim-cfn-stack.js";
import { SimCfnStackOperationScheduler } from "../sim-cfn-stack-operation-scheduler.js";
import { assertSimCfnStackNotUpdating } from "./sim-cfn-stack-update-guard.js";

interface SimCfnStackUpdateLifecycleProperties {
  readonly background: BackgroundScheduler;
  readonly stackName: SimCloudFormationStackName;
}

/**
 * The two halves of one Stack update: applying the new template, and putting
 * the Stack back the way it was if that fails.
 */
export interface SimCfnStackUpdateWork {
  readonly apply: () => Promise<void>;
  readonly rollBack: () => Promise<void>;
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
  private rollbackPromise: Promise<void> | undefined;
  private updateError: Error | undefined;
  private rollbackError: Error | undefined;

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
   *
   * A rollback that failed answers with its own failure, because that is what
   * the Stack is left in UPDATE_ROLLBACK_FAILED by and what has to be dealt
   * with before the Stack works again.
   */
  public get error(): Error | undefined {
    return this.rollbackError ?? this.updateError;
  }

  /** Refuse an update while one is already running, or being rolled back. */
  assertNotUpdating(): void {
    assertSimCfnStackNotUpdating(this.stackName, this.#status);
  }

  /**
   * Start the Stack update lifecycle.
   *
   * The returned promise only covers sequencing and scheduling, as deployment
   * and deletion do. The Resource work continues in the background, so callers
   * that need the final state should use waitForComplete().
   *
   * An update that fails is rolled back. The Stack moves to
   * UPDATE_ROLLBACK_IN_PROGRESS with the reason on it, the rollback is
   * scheduled as an operation of its own, and the Stack settles in
   * UPDATE_ROLLBACK_COMPLETE, or in UPDATE_ROLLBACK_FAILED if the rollback
   * could not finish either.
   */
  public async update(work: SimCfnStackUpdateWork): Promise<void> {
    this.#status = "UPDATE_IN_PROGRESS";
    this.updateError = undefined;
    this.rollbackError = undefined;
    this.rollbackPromise = undefined;

    const scheduler = new SimCfnStackOperationScheduler({
      background: this.background,
      failureMessage: "Sim CloudFormation Stack update failed",
    });

    await scheduler.sequence();

    this.completePromise = scheduler.schedule({
      operation: work.apply,
      onSuccess: () => {
        this.#status = "UPDATE_COMPLETE";
      },
      onFailure: (error) => {
        this.#status = "UPDATE_ROLLBACK_IN_PROGRESS";
        this.updateError = error;

        // Scheduled rather than run where the failure was caught, so the Stack
        // is visibly rolling back while it happens, the way it is visibly
        // updating while the update happens.
        this.rollbackPromise = scheduler.schedule({
          operation: work.rollBack,
          onSuccess: () => {
            this.#status = "UPDATE_ROLLBACK_COMPLETE";
          },
          onFailure: (failure) => {
            this.#status = "UPDATE_ROLLBACK_FAILED";
            this.rollbackError = failure;
          },
        });
      },
    });
  }

  /**
   * Wait for the scheduled update to finish, rollback included.
   *
   * If the update failed, this rethrows the captured error once the Stack has
   * settled, so a caller can see what stopped the new template being applied.
   * A Stack that was never updated has nothing to wait for.
   */
  public async waitForComplete(): Promise<void> {
    // Awaiting nothing is how a Stack that was never updated, and one that was
    // never rolled back, wait for the operation they never had.
    await this.completePromise;
    await this.rollbackPromise;

    if (this.updateError !== undefined) {
      throw this.updateError;
    }
  }
}
