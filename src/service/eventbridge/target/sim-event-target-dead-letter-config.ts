import {
  parseSqsQueueArn,
  type SimSqsQueueLocation,
} from "../../sqs/queue/sim-sqs-queue-arn.js";
import { SimEventBridgeValidationException } from "../error/sim-event-bridge.error.js";

const fifoQueueSuffix = ".fifo";

/**
 * A target's `DeadLetterConfig`, as a request or a template carries it.
 */
export interface SimEventTargetDeadLetterConfigInput {
  readonly Arn?: string | undefined;
}

/**
 * The standard SQS queue a target sends an event to once EventBridge gives up
 * delivering it.
 */
export class SimEventTargetDeadLetterConfig {
  public readonly declared: SimEventTargetDeadLetterConfigInput;
  public readonly arn: string;
  public readonly queue: SimSqsQueueLocation;

  private constructor(
    declared: SimEventTargetDeadLetterConfigInput,
    arn: string,
    queue: SimSqsQueueLocation,
  ) {
    this.declared = { ...declared };
    this.arn = arn;
    this.queue = queue;
  }

  /**
   * Read the dead-letter configuration a target may leave out.
   */
  static optional(
    config: SimEventTargetDeadLetterConfigInput | undefined,
  ): SimEventTargetDeadLetterConfig | undefined {
    if (config === undefined) {
      return undefined;
    }

    return this.of(config);
  }

  /**
   * Read a dead-letter configuration, refusing anything but a standard queue.
   *
   * Real EventBridge takes only a standard queue here. A FIFO queue is refused
   * by its name, which always ends `.fifo`.
   */
  static of(
    config: SimEventTargetDeadLetterConfigInput,
  ): SimEventTargetDeadLetterConfig {
    const arn = config.Arn ?? "";
    const queue = parseSqsQueueArn(arn);

    if (queue === undefined || queue.name.endsWith(fifoQueueSuffix)) {
      throw new SimEventBridgeValidationException(
        `Invalid parameter: Target DeadLetterConfig Arn Reason: '${arn}' is ` +
          `not a standard SQS queue ARN. One is ` +
          `arn:aws:sqs:<region>:<account-id>:<queue-name>.`,
      );
    }

    return new this(config, arn, queue);
  }
}
