import { SimLambdaInvalidParameterValueException } from "../../error/sim-lambda.error.js";
import { sqsQueueUrl } from "../../../sqs/queue/sim-sqs-queue-arn.js";
import { SimLambdaEventSourceBatchRules } from "../sim-lambda-event-source-batch-rules.js";
import { SimLambdaEventSourcePollingPermission } from "../sim-lambda-event-source-polling-permission.js";

const queueArnPattern =
  /^arn:aws:sqs:(?<region>[a-z0-9-]+):(?<account>\d{12}):(?<name>[\w-]{1,80})$/u;

/**
 * What a function's execution role has to be allowed to do on a queue for
 * Lambda to poll it.
 *
 * These are the three operations real Lambda checks when an SQS event source
 * mapping is created, and the three its poller performs afterwards.
 */
const queuePollingOperations = [
  "ReceiveMessage",
  "DeleteMessage",
  "GetQueueAttributes",
] as const;

/**
 * The batch sizes an SQS event source delivers with.
 *
 * Ten is both the batch real Lambda uses when the mapping names none, and the
 * largest batch it delivers from a standard queue without a batching window to
 * fill a bigger one.
 */
const queueBatchRules = new SimLambdaEventSourceBatchRules({
  defaultSize: 10,
  maximumSize: 10,
  sourceDescription: "a queue with no batching window",
});

/**
 * The queue ARN an event source mapping is created for.
 *
 * A queue ARN has no resource type separator in it, so it is parsed here rather
 * than by the shared ARN reader. Both halves of what a poller needs come out of
 * it: the URL requests name the queue by, and the Region the event records
 * report.
 */
export class SimLambdaSqsEventSourceArn {
  /**
   * How an ARN naming this kind of event source is written, for a refusal to
   * say what it wanted instead.
   */
  static readonly arnShape =
    "An SQS queue ARN is arn:aws:sqs:<region>:<account-id>:<queue-name>";

  public readonly kind = "sqs" as const;
  public readonly serviceLabel = "SQS";
  public readonly value: string;
  public readonly regionName: string;
  public readonly accountId: string;
  public readonly queueName: string;
  public readonly pollingPermissions: readonly SimLambdaEventSourcePollingPermission[];

  private constructor(value: string, parts: Record<string, string>) {
    this.value = value;
    this.regionName = parts["region"] ?? "";
    this.accountId = parts["account"] ?? "";
    this.queueName = parts["name"] ?? "";
    this.pollingPermissions = queuePollingOperations.map(
      (operation) =>
        new SimLambdaEventSourcePollingPermission(`sqs:${operation}`, value),
    );
  }

  /**
   * Read a queue ARN, answering with nothing when the ARN names something
   * else.
   *
   * This is what the event source ARN dispatcher asks, so that deciding what a
   * mapping may name stays in one place rather than in each parser.
   */
  static parse(queueArn: string): SimLambdaSqsEventSourceArn | undefined {
    const parts = queueArnPattern.exec(queueArn)?.groups;

    if (parts === undefined) {
      return undefined;
    }

    return new this(queueArn, parts);
  }

  /**
   * Read a queue ARN, refusing one that is not a queue ARN at all.
   */
  static of(queueArn: string): SimLambdaSqsEventSourceArn {
    const parsed = this.parse(queueArn);

    if (parsed === undefined) {
      throw new SimLambdaInvalidParameterValueException(
        `${queueArn} is not an SQS queue ARN. ${this.arnShape}`,
      );
    }

    return parsed;
  }

  /**
   * The batch sizes a mapping on this queue may deliver with.
   */
  get batchRules(): SimLambdaEventSourceBatchRules {
    return queueBatchRules;
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
