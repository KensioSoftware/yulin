import { parseSqsQueueArn } from "../../sqs/queue/sim-sqs-queue-arn.js";
import { SimSchedulerValidationException } from "../error/sim-scheduler.error.js";

export interface SimSchedulerDeadLetterConfigInput {
  readonly Arn?: string | undefined;
}

/**
 * The standard SQS queue a target sends undelivered input to.
 */
export class SimSchedulerDeadLetterConfig {
  public readonly declared: SimSchedulerDeadLetterConfigInput;
  public readonly arn: string | undefined;

  private constructor(config: SimSchedulerDeadLetterConfigInput) {
    this.declared = { ...config };
    this.arn = config.Arn;
  }

  /**
   * Read a dead-letter configuration, refusing anything but a standard queue.
   */
  static of(
    config: SimSchedulerDeadLetterConfigInput,
  ): SimSchedulerDeadLetterConfig {
    const { Arn: arn } = config;

    if (arn !== undefined && parseSqsQueueArn(arn) === undefined) {
      throw new SimSchedulerValidationException(
        `Target DeadLetterConfig Arn ${arn} is not a standard SQS queue ARN. ` +
          `One is arn:aws:sqs:<region>:<account-id>:<queue-name>.`,
      );
    }

    return new this(config);
  }
}
