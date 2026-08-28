interface SimSchedulerDeliveryFailureProperties {
  readonly scheduleName: string;
  readonly scheduleArn: string;
  readonly targetArn: string;
  readonly roleArn: string;
  readonly at: Date;
  readonly error: unknown;
}

/**
 * A failed invocation as it serialises. Every property the failure holds, plus
 * the message the getter reads off the error.
 */
export interface SimSchedulerDeliveryFailureJson extends SimSchedulerDeliveryFailureProperties {
  readonly message: string;
}

/**
 * One invocation a schedule could not make.
 */
export class SimSchedulerDeliveryFailure {
  public readonly scheduleName: string;
  public readonly scheduleArn: string;
  public readonly targetArn: string;

  /**
   * The execution role the invocation was attempted as, which is where most of
   * these are fixed.
   */
  public readonly roleArn: string;

  /**
   * The instant the schedule fell due, on the simulation's clock.
   */
  public readonly at: Date;

  public readonly error: unknown;

  constructor(properties: SimSchedulerDeliveryFailureProperties) {
    this.scheduleName = properties.scheduleName;
    this.scheduleArn = properties.scheduleArn;
    this.targetArn = properties.targetArn;
    this.roleArn = properties.roleArn;
    this.at = properties.at;
    this.error = properties.error;
  }

  /**
   * What went wrong, as a message.
   */
  get message(): string {
    if (this.error instanceof Error) {
      return this.error.message;
    }

    return String(this.error);
  }

  /**
   * The failure as JSON.stringify renders it, message included.
   *
   * Serialising a failure is the first thing to reach for when a schedule did
   * not do what a test expected. The message is a getter on the prototype and
   * would be left out. An Error keeps its own message on a non-enumerable
   * property and prints as `{}`.
   */
  toJSON(): SimSchedulerDeliveryFailureJson {
    return {
      scheduleName: this.scheduleName,
      scheduleArn: this.scheduleArn,
      targetArn: this.targetArn,
      roleArn: this.roleArn,
      at: this.at,
      message: this.message,
      error: this.error,
    };
  }
}

/**
 * Every invocation one simulated Scheduler scope could not make.
 *
 * Real Scheduler tells nobody about a failed invocation as it happens: it goes
 * to CloudWatch metrics, or to a dead letter queue if one is configured, and
 * the caller who created the schedule is long gone. So a target that is
 * unexpectedly empty is explained here rather than by anything an SDK call
 * returned.
 */
export class SimSchedulerDeliveryFailures {
  private readonly failures: SimSchedulerDeliveryFailure[] = [];

  /**
   * Every failure so far, oldest first.
   */
  get all(): readonly SimSchedulerDeliveryFailure[] {
    return [...this.failures];
  }

  /**
   * Keep a failed invocation.
   */
  record(properties: SimSchedulerDeliveryFailureProperties): void {
    this.failures.push(new SimSchedulerDeliveryFailure(properties));
  }
}
