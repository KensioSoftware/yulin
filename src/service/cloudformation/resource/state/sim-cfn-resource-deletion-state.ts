import type { SimCloudFormationResourceStatus } from "../sim-cfn-resource.type.js";

/**
 * Tracks CloudFormation Resource deletion status and failure.
 *
 * Deletion state is separate from creation state rather than sharing one status
 * field, because the two answer different questions. Creation state says what
 * the Resource became; deletion state says what happened when the Stack asked
 * for it to be taken away again. A Resource that was never asked to delete has
 * no deletion status at all, which is what `undefined` means here.
 */
export class SimCfnResourceDeletionState {
  #status: SimCloudFormationResourceStatus | undefined;
  #skippedReason: string | undefined;
  #failure: Error | undefined;

  /**
   * The current deletion status, or undefined if deletion has not started.
   */
  public get status(): SimCloudFormationResourceStatus | undefined {
    return this.#status;
  }

  /**
   * Whether this Resource has reached a terminal deletion status.
   */
  public get deleteComplete(): boolean {
    return (
      this.retained ||
      this.#status === "DELETE_COMPLETE" ||
      this.#status === "DELETE_FAILED"
    );
  }

  /**
   * Whether this Resource was left in simulated AWS because a policy attribute
   * or the DeleteStack call said to keep it.
   */
  public get retained(): boolean {
    return this.#status === "DELETE_SKIPPED";
  }

  /**
   * Whether this Resource was removed from simulated AWS.
   *
   * A skipped deletion is delete-complete without this being true, mirroring a
   * skipped creation, which is create-complete without being deployed.
   */
  public get deleted(): boolean {
    return (
      this.#status === "DELETE_COMPLETE" && this.#skippedReason === undefined
    );
  }

  /**
   * Whether deletion was recorded rather than carried out, because sim
   * CloudFormation has no way to delete this Resource type.
   */
  public get skipped(): boolean {
    return this.#skippedReason !== undefined;
  }

  /**
   * The reason this Resource's deletion was skipped, if it was skipped.
   */
  public get skippedReason(): string | undefined {
    return this.#skippedReason;
  }

  /**
   * The failure captured for this Resource, if deletion failed.
   */
  public get error(): Error | undefined {
    return this.#failure;
  }

  /**
   * Mark this Resource as deletion in progress.
   */
  markDeleteInProgress(): void {
    this.#failure = undefined;
    this.#skippedReason = undefined;
    this.#status = "DELETE_IN_PROGRESS";
  }

  /**
   * Mark this Resource as successfully deleted.
   */
  markDeleteComplete(): void {
    this.#failure = undefined;
    this.#skippedReason = undefined;
    this.#status = "DELETE_COMPLETE";
  }

  /**
   * Mark this Resource's deletion as skipped because sim CloudFormation cannot
   * delete its service or Resource type.
   *
   * Skipped deletions are treated as DELETE_COMPLETE, the same way an
   * unsupported Resource type is treated as CREATE_COMPLETE, so one Resource
   * nothing can remove does not hold up the rest of the teardown.
   */
  markDeleteSkipped(reason: string): void {
    this.#failure = undefined;
    this.#skippedReason = reason;
    this.#status = "DELETE_COMPLETE";
  }

  /**
   * Mark this Resource as kept in simulated AWS.
   *
   * DELETE_SKIPPED is the status CloudFormation itself reports for a retained
   * Resource, and it counts as terminal so the rest of the teardown carries on
   * around it.
   */
  markDeleteRetained(): void {
    this.#failure = undefined;
    this.#skippedReason = undefined;
    this.#status = "DELETE_SKIPPED";
  }

  /**
   * Mark this Resource as failed to delete.
   */
  markDeleteFailed(error?: Error): void {
    this.#failure = error;
    this.#skippedReason = undefined;
    this.#status = "DELETE_FAILED";
  }
}
