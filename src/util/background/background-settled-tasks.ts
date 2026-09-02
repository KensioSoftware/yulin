/**
 * The outcome of waiting on a batch of background tasks.
 *
 * Background work runs outside the call that scheduled it, so a task that
 * throws has nowhere to report to. Waiting for tasks to settle is that
 * moment: this is what turns a settled batch back into a thrown error, so a
 * failure in the background surfaces to whoever waited rather than vanishing.
 *
 * A wait that ended on something else, such as a task parking on the clock,
 * settled no batch at all and has no failure to report.
 */
export class BackgroundSettledTasks {
  private readonly results: readonly PromiseSettledResult<unknown>[];

  constructor(results: readonly PromiseSettledResult<unknown>[] = []) {
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
