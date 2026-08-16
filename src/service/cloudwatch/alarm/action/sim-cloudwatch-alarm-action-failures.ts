/**
 * What one alarm action could not do.
 */
export interface SimCloudWatchAlarmActionFailureProperties {
  readonly alarmName: string;
  readonly alarmArn: string;
  readonly actionArn: string;
  readonly error: unknown;
}

/**
 * One notification an alarm could not send.
 */
export class SimCloudWatchAlarmActionFailure {
  readonly alarmName: string;
  readonly alarmArn: string;
  readonly actionArn: string;
  readonly error: unknown;

  constructor(properties: SimCloudWatchAlarmActionFailureProperties) {
    this.alarmName = properties.alarmName;
    this.alarmArn = properties.alarmArn;
    this.actionArn = properties.actionArn;
    this.error = properties.error;
  }

  /**
   * What went wrong, in one line.
   */
  get reason(): string {
    return this.error instanceof Error
      ? this.error.message
      : String(this.error);
  }
}

/**
 * What became of the notifications a simulated CloudWatch scope could not
 * send.
 *
 * Real CloudWatch tells nobody when an alarm action fails: the alarm changes
 * state either way and the failure is visible only in the absence of the
 * notification. Neither does this, because a failing action must not stop an
 * alarm evaluating. Swallowing it entirely would leave a queue mysteriously
 * empty, which is the hardest kind of test to debug, so every failure is kept
 * for inspection and warned about once.
 */
export class SimCloudWatchAlarmActionFailures {
  readonly #failures: SimCloudWatchAlarmActionFailure[] = [];
  readonly #warned = new Set<string>();

  /**
   * Every notification this scope could not send, oldest first.
   */
  get all(): readonly SimCloudWatchAlarmActionFailure[] {
    return this.#failures;
  }

  /**
   * Record a failed action.
   */
  record(properties: SimCloudWatchAlarmActionFailureProperties): void {
    const failure = new SimCloudWatchAlarmActionFailure(properties);

    this.#failures.push(failure);
    this.warn(failure);
  }

  /**
   * Warn about an action that failed, once per action and cause.
   *
   * Warnings go to the console because that is where a test runner surfaces
   * them next to the failing expectation they explain; the simulator has no
   * logger of its own to route them through.
   */
  private warn(failure: SimCloudWatchAlarmActionFailure): void {
    const key = `${failure.actionArn}:${failure.reason}`;

    if (this.#warned.has(key)) {
      return;
    }

    this.#warned.add(key);

    // oxlint-disable-next-line no-console
    console.warn(
      `Simulated CloudWatch alarm ${failure.alarmName} could not notify ` +
        `${failure.actionArn}: ${failure.reason}`,
    );
  }
}
