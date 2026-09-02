import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimCloudFormationStackStatus } from "../sim-cfn-stack.js";
import { SimCfnStackOperationScheduler } from "../sim-cfn-stack-operation-scheduler.js";

interface SimCfnStackDeletionLifecycleProperties {
  readonly background: BackgroundScheduler;

  /**
   * Actual Stack Resource teardown work supplied by SimCfnStack.
   *
   * The lifecycle stores this callback for the same reason the deployment
   * lifecycle stores its own: reverse-dependency-ordered Resource deletion
   * stays outside this class, while status, error and completion handling stay
   * inside it.
   */
  readonly runTeardown: (
    properties: SimCfnStackDeleteProperties,
  ) => Promise<void>;
}

export interface SimCfnStackDeleteProperties {
  /**
   * Called once the Stack has finished deleting successfully.
   *
   * Releasing the Stack name belongs to whoever holds the Stack map, so the
   * lifecycle only says when the name is free rather than freeing it.
   */
  readonly onDeleteComplete?: (() => void) | undefined;

  /**
   * Resources to leave in simulated AWS, named by logical ID or CDK construct
   * ID. What DeleteStack RetainResources asks for, and it overrides whatever
   * the Resource's own DeletionPolicy says.
   */
  readonly retainResources?: readonly string[] | undefined;
}

/**
 * Owns the simulated CloudFormation Stack deletion lifecycle state.
 *
 * The mirror image of SimCfnStackDeploymentLifecycle, and separate from it for
 * the same reason SimCfnResourceDeletionState is separate from
 * SimCfnResourceCreationState: the two answer different questions, and a Stack
 * that was never asked to delete has no deletion status at all.
 *
 * It does not delete Resources, order them, or decide what a service has to do
 * to remove one.
 */
export class SimCfnStackDeletionLifecycle {
  private readonly background: BackgroundScheduler;
  private readonly runTeardown: (
    properties: SimCfnStackDeleteProperties,
  ) => Promise<void>;
  #status: SimCloudFormationStackStatus | undefined;

  private completePromise: Promise<void> | undefined;
  private teardownError: Error | undefined;

  constructor(properties: SimCfnStackDeletionLifecycleProperties) {
    this.background = properties.background;
    this.runTeardown = properties.runTeardown;
  }

  /**
   * The current Stack deletion status, or undefined if deletion has not
   * started.
   */
  public get status(): SimCloudFormationStackStatus | undefined {
    return this.#status;
  }

  /**
   * The error captured during background deletion, if any.
   */
  public get error(): Error | undefined {
    return this.teardownError;
  }

  /**
   * Start the Stack deletion lifecycle.
   *
   * The returned promise only covers sequencing and scheduling. Resource
   * teardown continues in the background, as deployment does, so callers that
   * need the final state should use waitForComplete().
   *
   * Asking again for a Stack that is already deleting or already deleted does
   * nothing, which is how CloudFormation treats a repeated DeleteStack. A Stack
   * left in DELETE_FAILED can be asked again, because the reason the teardown
   * failed may have been dealt with since.
   */
  public async delete(
    properties: SimCfnStackDeleteProperties = {},
  ): Promise<void> {
    if (
      this.#status === "DELETE_IN_PROGRESS" ||
      this.#status === "DELETE_COMPLETE"
    ) {
      return;
    }

    this.#status = "DELETE_IN_PROGRESS";
    this.teardownError = undefined;

    const scheduler = new SimCfnStackOperationScheduler({
      background: this.background,
      failureMessage: "Sim CloudFormation Stack delete failed",
    });

    await scheduler.sequence();

    this.completePromise = scheduler.schedule({
      operation: async (): Promise<void> => {
        await this.runTeardown(properties);
      },
      onSuccess: () => {
        this.#status = "DELETE_COMPLETE";
        properties.onDeleteComplete?.();
      },
      onFailure: (error) => {
        this.#status = "DELETE_FAILED";
        this.teardownError = error;
      },
    });
  }

  /**
   * Wait for the scheduled teardown to finish.
   *
   * If the teardown failed, this rethrows the captured error, so a caller can
   * see what stopped the Stack going away. A Stack that was never asked to
   * delete has nothing to wait for.
   */
  public async waitForComplete(): Promise<void> {
    if (this.completePromise !== undefined) {
      await this.completePromise;
    }

    if (this.teardownError !== undefined) {
      throw this.teardownError;
    }
  }
}
