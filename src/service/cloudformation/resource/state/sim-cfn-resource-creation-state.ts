import type { SimCloudFormationResourceStatus } from "../sim-cfn-resource.js";

/**
 * Tracks CloudFormation Resource creation status, backing sim Resource and
 * error.
 */
export class SimCfnResourceCreationState<T extends object = object> {
  #status: SimCloudFormationResourceStatus = "CREATE_PENDING";
  #simResource: T | undefined;
  private deployError: Error | undefined;
  #skippedReason: string | undefined;

  /**
   * Get the current Resource status.
   */
  public get status(): SimCloudFormationResourceStatus {
    return this.#status;
  }

  /**
   * Whether this Resource has been deployed into simulated AWS.
   */
  public get deployed(): boolean {
    return (
      this.#status === "CREATE_COMPLETE" && this.#skippedReason === undefined
    );
  }

  /**
   * Whether this Resource was skipped because sim CloudFormation does not yet
   * support creating its service or Resource type.
   */
  public get skipped(): boolean {
    return this.#skippedReason !== undefined;
  }

  /**
   * The reason this Resource was skipped, if it was skipped.
   */
  public get skippedReason(): string | undefined {
    return this.#skippedReason;
  }

  /**
   * Whether this Resource has reached a terminal creation status.
   */
  public get createComplete(): boolean {
    return (
      this.#status === "CREATE_COMPLETE" || this.#status === "CREATE_FAILED"
    );
  }

  /**
   * The simulated AWS resource represented by this CloudFormation Resource.
   */
  public get simResource(): T | undefined {
    return this.#simResource;
  }

  /**
   * Get the deployment error, if Resource creation failed.
   */
  public get error(): Error | undefined {
    return this.deployError;
  }

  /**
   * Mark this Resource as creation in progress.
   */
  markCreateInProgress(): void {
    this.deployError = undefined;
    this.#simResource = undefined;
    this.#skippedReason = undefined;
    this.#status = "CREATE_IN_PROGRESS";
  }

  /**
   * Mark this Resource as successfully created.
   */
  markCreateComplete(simResource?: T): void {
    this.#simResource = simResource;
    this.deployError = undefined;
    this.#skippedReason = undefined;
    this.#status = "CREATE_COMPLETE";
  }

  /**
   * Mark this Resource as skipped because its sim implementation is not yet
   * available.
   */
  markCreateSkipped(reason: string): void {
    this.#simResource = undefined;
    this.deployError = undefined;
    this.#skippedReason = reason;
    this.#status = "CREATE_COMPLETE";
  }

  /**
   * Mark this Resource as failed to create.
   */
  markCreateFailed(error?: Error): void {
    this.deployError = error;
    this.#simResource = undefined;
    this.#skippedReason = undefined;
    this.#status = "CREATE_FAILED";
  }
}
