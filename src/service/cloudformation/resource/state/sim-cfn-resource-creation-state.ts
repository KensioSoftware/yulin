import type { SimCloudFormationResourceStatus } from "../sim-cfn-resource.js";

/**
 * Why a Resource reached CREATE_COMPLETE without anything being created for it.
 *
 * A skip is a gap: nothing simulates that Resource, so a test written against
 * it will find it missing. Inert is the opposite finding: the Resource was left
 * out on purpose because nothing this simulator models could tell it apart from
 * one that was created. The two are told apart here rather than by reading the
 * reason, so a report can keep the gaps separate from the deliberate omissions.
 */
interface SimCfnResourceUncreated {
  readonly kind: "skipped" | "inert";
  readonly reason: string;
}

/**
 * Tracks CloudFormation Resource creation status, backing sim Resource and
 * error.
 */
export class SimCfnResourceCreationState<T extends object = object> {
  #status: SimCloudFormationResourceStatus = "CREATE_PENDING";
  #simResource: T | undefined;
  private deployError: Error | undefined;
  #uncreated: SimCfnResourceUncreated | undefined;

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
    return this.#status === "CREATE_COMPLETE" && this.#uncreated === undefined;
  }

  /**
   * Whether this Resource was skipped because sim CloudFormation does not yet
   * support creating its service or Resource type.
   */
  public get skipped(): boolean {
    return this.#uncreated?.kind === "skipped";
  }

  /**
   * The reason this Resource was skipped, if it was skipped.
   */
  public get skippedReason(): string | undefined {
    return this.reasonFor("skipped");
  }

  /**
   * Whether this Resource was deliberately left uncreated, because nothing this
   * simulator models could tell it apart from one that was created.
   */
  public get inert(): boolean {
    return this.#uncreated?.kind === "inert";
  }

  /**
   * The reason this Resource was left uncreated, if it was inert.
   */
  public get inertReason(): string | undefined {
    return this.reasonFor("inert");
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
    this.#uncreated = undefined;
    this.#status = "CREATE_IN_PROGRESS";
  }

  /**
   * Mark this Resource as successfully created.
   */
  markCreateComplete(simResource?: T): void {
    this.#simResource = simResource;
    this.deployError = undefined;
    this.#uncreated = undefined;
    this.#status = "CREATE_COMPLETE";
  }

  /**
   * Mark this Resource as skipped because its sim implementation is not yet
   * available.
   */
  markCreateSkipped(reason: string): void {
    this.markUncreated({ kind: "skipped", reason });
  }

  /**
   * Mark this Resource as deliberately not created, because nothing this
   * simulator models could tell it apart from one that was.
   */
  markCreateInert(reason: string): void {
    this.markUncreated({ kind: "inert", reason });
  }

  /**
   * Mark this Resource as failed to create.
   */
  markCreateFailed(error?: Error): void {
    this.deployError = error;
    this.#simResource = undefined;
    this.#uncreated = undefined;
    this.#status = "CREATE_FAILED";
  }

  /**
   * Both ways of not creating a Resource leave it CREATE_COMPLETE, so one
   * Resource this simulator did not make does not hold up the rest of a Stack.
   */
  private markUncreated(uncreated: SimCfnResourceUncreated): void {
    this.#simResource = undefined;
    this.deployError = undefined;
    this.#uncreated = uncreated;
    this.#status = "CREATE_COMPLETE";
  }

  private reasonFor(kind: SimCfnResourceUncreated["kind"]): string | undefined {
    return this.#uncreated?.kind === kind ? this.#uncreated.reason : undefined;
  }
}
