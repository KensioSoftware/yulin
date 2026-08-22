import type { SimFirehoseFailure } from "./sim-firehose-failure.js";

/**
 * What became of the work a simulated Firehose scope could not do.
 *
 * A refusal is recorded quietly and anything else is warned about. Taking a
 * permission off a Role is what a test checking the refusal does, and that test
 * should not have to read a warning about the thing it asked for. Anything else
 * is a broken simulation, and a test that never reads this list should still
 * hear about it. Compare SimS3NotificationFailures, which draws the same line
 * for the same reason.
 *
 * Warnings go to the console because that is where a test runner surfaces them
 * next to the failing expectation they explain. The simulator has no logger of
 * its own to route them through.
 */
export class SimFirehoseFailures<TFailure extends SimFirehoseFailure> {
  private readonly failures: TFailure[] = [];
  private readonly warned = new Set<string>();

  /**
   * Every failure of this kind in this scope, oldest first.
   */
  get all(): readonly TFailure[] {
    return this.failures;
  }

  /**
   * Record something that did not happen.
   */
  record(failure: TFailure): void {
    this.failures.push(failure);

    if (failure.wasRefused) {
      return;
    }

    this.warn(failure);
  }

  /**
   * Warn about a failure once per delivery stream and cause.
   */
  private warn(failure: TFailure): void {
    const key = `${failure.deliveryStreamName}:${failure.reason}`;

    if (this.warned.has(key)) {
      return;
    }

    this.warned.add(key);

    // oxlint-disable-next-line no-console
    console.warn(failure.warning);
  }
}
