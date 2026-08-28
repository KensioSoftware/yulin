interface SimEventBridgeDeliveryFailureProperties {
  readonly ruleName: string;
  readonly ruleArn: string;
  readonly targetId: string;
  readonly targetArn: string;
  readonly eventId: string;
  readonly error: unknown;
}

/**
 * A failed delivery as it serialises. Every property the failure holds, plus
 * the message the getter reads off the error.
 */
export interface SimEventBridgeDeliveryFailureJson extends SimEventBridgeDeliveryFailureProperties {
  readonly message: string;
}

/**
 * One event a rule could not get to one of its targets.
 */
export class SimEventBridgeDeliveryFailure {
  public readonly ruleName: string;
  public readonly ruleArn: string;
  public readonly targetId: string;
  public readonly targetArn: string;
  public readonly eventId: string;
  public readonly error: unknown;

  constructor(properties: SimEventBridgeDeliveryFailureProperties) {
    this.ruleName = properties.ruleName;
    this.ruleArn = properties.ruleArn;
    this.targetId = properties.targetId;
    this.targetArn = properties.targetArn;
    this.eventId = properties.eventId;
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
   * Serialising a failure is the first thing to reach for when a target
   * received nothing. The message is a getter on the prototype and would be
   * left out. An Error keeps its own message on a non-enumerable property and
   * prints as `{}`.
   */
  toJSON(): SimEventBridgeDeliveryFailureJson {
    return {
      ruleName: this.ruleName,
      ruleArn: this.ruleArn,
      targetId: this.targetId,
      targetArn: this.targetArn,
      eventId: this.eventId,
      message: this.message,
      error: this.error,
    };
  }
}

/**
 * Every delivery one simulated EventBridge scope could not make.
 *
 * Real EventBridge tells the publisher nothing about a failed delivery: a
 * PutEvents that matched a rule whose target refuses the call still answers
 * with an event id. So a target that is unexpectedly empty is explained here
 * rather than by anything the SDK returned.
 */
export class SimEventBridgeDeliveryFailures {
  private readonly failures: SimEventBridgeDeliveryFailure[] = [];

  /**
   * Every failure so far, oldest first.
   */
  get all(): readonly SimEventBridgeDeliveryFailure[] {
    return [...this.failures];
  }

  /**
   * Keep a failed delivery.
   */
  record(properties: SimEventBridgeDeliveryFailureProperties): void {
    this.failures.push(new SimEventBridgeDeliveryFailure(properties));
  }
}
