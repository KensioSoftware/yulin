import { SimSnsDeliveryNotPermitted } from "../error/sim-sns-delivery.error.js";

/**
 * What a delivery that failed was trying to do.
 */
export interface SimSnsDeliveryFailureProperties {
  readonly topicArn: string;
  readonly subscriptionArn: string;
  readonly endpointArn: string;
  readonly messageId: string;
  readonly error: unknown;
}

/**
 * One message an endpoint did not take.
 */
export class SimSnsDeliveryFailure {
  public readonly topicArn: string;
  public readonly subscriptionArn: string;
  public readonly endpointArn: string;
  public readonly messageId: string;
  public readonly error: unknown;

  constructor(properties: SimSnsDeliveryFailureProperties) {
    this.topicArn = properties.topicArn;
    this.subscriptionArn = properties.subscriptionArn;
    this.endpointArn = properties.endpointArn;
    this.messageId = properties.messageId;
    this.error = properties.error;
  }

  /**
   * Whether the endpoint refused the message rather than failing on it.
   */
  get wasRefused(): boolean {
    return this.error instanceof SimSnsDeliveryNotPermitted;
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
 * What became of the messages a simulated SNS scope could not deliver.
 *
 * Real SNS tells the publisher nothing about a failed delivery: the publish is
 * answered with a message id before anything is delivered, and a delivery that
 * fails after that is the subscription's problem. Neither does this. Swallowing
 * the failure entirely would leave a queue mysteriously empty, so every failure
 * is kept for inspection and anything other than a refusal is warned about
 * once.
 */
export class SimSnsDeliveryFailures {
  private readonly failures: SimSnsDeliveryFailure[] = [];
  private readonly warned = new Set<string>();

  /**
   * Every message this scope could not deliver, oldest first.
   */
  get all(): readonly SimSnsDeliveryFailure[] {
    return this.failures;
  }

  /**
   * Record a failed delivery, from what the fan-out knows about it.
   */
  record(properties: SimSnsDeliveryFailureProperties): void {
    const failure = new SimSnsDeliveryFailure(properties);

    this.failures.push(failure);

    if (failure.wasRefused) {
      // A refusal is a modelled outcome rather than a fault: the queue policy
      // says no, which is what a test taking a permission away is checking
      // for. It is recorded, not warned about.
      return;
    }

    this.warn(failure);
  }

  /**
   * Warn about an endpoint that failed, once per endpoint and cause.
   *
   * Warnings go to the console because that is where a test runner surfaces
   * them next to the failing expectation they explain; the simulator has no
   * logger of its own to route them through.
   */
  private warn(failure: SimSnsDeliveryFailure): void {
    const key = `${failure.endpointArn}:${failure.reason}`;

    if (this.warned.has(key)) {
      return;
    }

    this.warned.add(key);

    // oxlint-disable-next-line no-console
    console.warn(
      `Simulated SNS topic ${failure.topicArn} could not deliver to ` +
        `${failure.endpointArn}: ${failure.reason}`,
    );
  }
}
