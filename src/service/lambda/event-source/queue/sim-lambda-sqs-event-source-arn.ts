import { SimLambdaInvalidParameterValueException } from "../../error/sim-lambda.error.js";
import { sqsQueueUrl } from "../../../sqs/queue/sim-sqs-queue-arn.js";

const queueArnPattern =
  /^arn:aws:sqs:(?<region>[a-z0-9-]+):(?<account>\d{12}):(?<name>[\w-]{1,80})$/u;

/**
 * The queue ARN an event source mapping is created for.
 *
 * A queue ARN has no resource type separator in it, so it is parsed here rather
 * than by the shared ARN reader. Both halves of what a poller needs come out of
 * it: the URL requests name the queue by, and the Region the event records
 * report.
 */
export class SimLambdaSqsEventSourceArn {
  public readonly value: string;
  public readonly regionName: string;
  public readonly accountId: string;
  public readonly queueName: string;

  private constructor(value: string, parts: Record<string, string>) {
    this.value = value;
    this.regionName = parts["region"] ?? "";
    this.accountId = parts["account"] ?? "";
    this.queueName = parts["name"] ?? "";
  }

  /**
   * Read an event source ARN, refusing one that names no simulated event
   * source.
   *
   * SQS queues are the only event source this simulation polls, so an ARN for
   * any other one is refused rather than accepted and never delivered from.
   */
  static of(eventSourceArn: string): SimLambdaSqsEventSourceArn {
    const parts = queueArnPattern.exec(eventSourceArn)?.groups;

    if (parts === undefined) {
      throw new SimLambdaInvalidParameterValueException(
        `EventSourceArn ${eventSourceArn} is not an SQS queue ARN. SQS queues ` +
          "are the only simulated Lambda event source, and a queue ARN is " +
          "arn:aws:sqs:<region>:<account-id>:<queue-name>",
      );
    }

    return new this(eventSourceArn, parts);
  }

  /**
   * The URL SQS requests name this queue by.
   */
  get queueUrl(): string {
    return sqsQueueUrl({
      regionName: this.regionName,
      accountId: this.accountId,
      name: this.queueName,
    });
  }

  /**
   * Whether this queue is in an Account and Region.
   */
  isIn(accountId: string, regionName: string): boolean {
    return this.accountId === accountId && this.regionName === regionName;
  }
}
