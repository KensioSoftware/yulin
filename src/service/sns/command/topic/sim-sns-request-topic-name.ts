import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import {
  SimSnsInvalidParameterException,
  SimSnsNotFoundException,
} from "../../error/sim-sns.error.js";
import { parseSnsTopicArn } from "../../topic/sim-sns-topic-arn.js";

/**
 * Read the topic name out of the ARN a request carries.
 *
 * An ARN naming another Account or Region reaches nothing, rather than having
 * its name read out and looked up locally. A topic ARN is scoped, and treating
 * a foreign one as local would let a test pass while the real call crossed an
 * Account boundary it has no permission for.
 */
export function simSnsRequestTopicName(
  topicArn: string | undefined,
  scope: SimAwsAccountRegionScope,
): string {
  if (topicArn === undefined || topicArn === "") {
    throw new SimSnsInvalidParameterException(
      "Invalid parameter: TopicArn is required",
    );
  }

  const parts = parseSnsTopicArn(topicArn);

  if (parts === undefined) {
    throw new SimSnsInvalidParameterException(
      `Invalid parameter: TopicArn Reason: ${topicArn} is not a topic ARN, ` +
        `which is arn:aws:sns:<region>:<account-id>:<topic-name>`,
    );
  }

  if (
    parts.accountId !== scope.accountId ||
    parts.regionName !== scope.regionName
  ) {
    throw new SimSnsNotFoundException(
      `Topic does not exist: ${topicArn} names Account ${parts.accountId} in ` +
        `${parts.regionName}, and this simulated SNS is Account ` +
        `${scope.accountId} in ${scope.regionName}`,
    );
  }

  return parts.name;
}
