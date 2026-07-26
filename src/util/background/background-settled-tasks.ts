/**
 * The outcome of waiting on a batch of background tasks.
 *
 * Background work runs outside the call that scheduled it, so a task that
 * throws has nowhere to report to. Waiting for tasks to settle is that
 * moment: this is what turns a settled batch back into a thrown error, so a
 * failure in the background surfaces to whoever waited rather than vanishing.
 */
export class BackgroundSettledTasks {
  private readonly results: PromiseSettledResult<void>[];

  constructor(results: PromiseSettledResult<void>[]) {
    this.results = results;
  }

  /**
   * Throw the first task failure in the batch, if there was one.
   */
  throwFirstFailure(): void {
    const rejected = this.results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );

    if (rejected !== undefined) {
      throw rejected.reason;
    }
  }
}
