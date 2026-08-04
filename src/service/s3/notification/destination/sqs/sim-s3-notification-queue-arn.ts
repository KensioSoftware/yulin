import type { SimAwsAccountId } from "../../../../aws/sim-aws-account.js";
import type { AwsRegionName } from "../../../../aws/sim-aws-region.js";
import { sqsQueueUrl } from "../../../../sqs/queue/sim-sqs-queue-arn.js";
import {
  SimS3InvalidArgument,
  SimS3NotImplemented,
} from "../../../error/sim-s3.error.js";

/**
 * The SQS queue ARN a notification configuration names.
 *
 * A queue ARN has no resource type segment, so the queue name follows the
 * Account id directly and the shared ARN reader cannot read one.
 */
export class SimS3NotificationQueueArn {
  public readonly regionName: AwsRegionName;
  public readonly accountId: SimAwsAccountId;
  public readonly queueName: string;

  private constructor(
    regionName: AwsRegionName,
    accountId: SimAwsAccountId,
    queueName: string,
  ) {
    this.regionName = regionName;
    this.accountId = accountId;
    this.queueName = queueName;
  }

  /**
   * Read an SQS queue ARN, refusing anything else.
   *
   * A FIFO queue is refused by its name, as real S3 refuses one as an event
   * notification destination. Simulated SQS has no FIFO queues either, so
   * without this the refusal would be that the queue does not exist, which
   * points at the wrong thing to fix.
   */
  static parse(arn: string): SimS3NotificationQueueArn {
    const [prefix, partition, service, region, accountId, name, extra] =
      arn.split(":");

    if (
      prefix !== "arn" ||
      partition !== "aws" ||
      service !== "sqs" ||
      region === undefined ||
      region === "" ||
      accountId === undefined ||
      accountId === "" ||
      name === undefined ||
      name === "" ||
      extra !== undefined
    ) {
      throw new SimS3InvalidArgument(`${arn} is not an SQS queue ARN.`);
    }

    if (name.endsWith(".fifo")) {
      throw new SimS3NotImplemented(
        `Cannot notify ${arn}: a FIFO queue is not a valid S3 event ` +
          "notification destination, and simulated SQS has no FIFO queues.",
      );
    }

    return new SimS3NotificationQueueArn(
      region as AwsRegionName,
      accountId as SimAwsAccountId,
      name,
    );
  }

  /**
   * The URL an SQS request names this queue by.
   */
  get queueUrl(): string {
    return sqsQueueUrl({
      regionName: this.regionName,
      accountId: this.accountId,
      name: this.queueName,
    });
  }

  /**
   * Whether this queue is in a Region, which a destination queue has to share
   * with the Bucket notifying it.
   */
  isIn(regionName: string): boolean {
    return this.regionName === regionName;
  }
}
