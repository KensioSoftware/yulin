import type { SimAwsAccountId } from "../../../../aws/sim-aws-account.js";
import type { AwsRegionName } from "../../../../aws/sim-aws-region.js";
import { parseSnsTopicArn } from "../../../../sns/topic/sim-sns-topic-arn.js";
import {
  SimS3InvalidArgument,
  SimS3NotImplemented,
} from "../../../error/sim-s3.error.js";

/**
 * The SNS topic ARN a notification configuration names.
 *
 * A topic ARN has no resource type segment, so the topic name follows the
 * Account id directly, which is why the shared ARN reader cannot read one and
 * SNS's own reader is borrowed here instead.
 */
export class SimS3NotificationTopicArn {
  public readonly regionName: AwsRegionName;
  public readonly accountId: SimAwsAccountId;
  public readonly topicName: string;
  public readonly value: string;

  private constructor(
    regionName: AwsRegionName,
    accountId: SimAwsAccountId,
    topicName: string,
    value: string,
  ) {
    this.regionName = regionName;
    this.accountId = accountId;
    this.topicName = topicName;
    this.value = value;
  }

  /**
   * Read an SNS topic ARN, refusing anything else.
   *
   * A FIFO topic is refused by its name, as real S3 refuses one as an event
   * notification destination. Simulated SNS has no FIFO topics either, so
   * without this the refusal would be that the topic does not exist, which
   * points at the wrong thing to fix.
   */
  static parse(arn: string): SimS3NotificationTopicArn {
    const location = parseSnsTopicArn(arn);

    if (location === undefined) {
      throw new SimS3InvalidArgument(`${arn} is not an SNS topic ARN.`);
    }

    if (location.name.endsWith(".fifo")) {
      throw new SimS3NotImplemented(
        `Cannot notify ${arn}: a FIFO topic is not a valid S3 event ` +
          "notification destination, and simulated SNS has no FIFO topics.",
      );
    }

    return new SimS3NotificationTopicArn(
      location.regionName as AwsRegionName,
      location.accountId as SimAwsAccountId,
      location.name,
      arn,
    );
  }

  /**
   * Whether this topic is in a Region, which a destination topic has to share
   * with the Bucket notifying it.
   */
  isIn(regionName: string): boolean {
    return this.regionName === regionName;
  }
}
