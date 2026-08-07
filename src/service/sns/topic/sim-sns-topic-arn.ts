import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimSnsTopicName } from "./sim-sns-topic-name.js";

/**
 * The number of colon separated parts in a topic ARN.
 *
 * A topic ARN has no resource type separator, so the name is the sixth and last
 * part. A subscription ARN has a seventh, which is what keeps one from being
 * read as a topic ARN with an odd name.
 */
const topicArnParts = 6;

const topicArnPartition = "aws";

const topicArnService = "sns";

/**
 * The part of a topic ARN that comes before the topic's own name.
 *
 * A topic ARN has no resource type separator, so the name follows the account
 * id directly. That is why `parseSimArn` cannot read one, and why an IAM policy
 * resource for a topic is `arn:aws:sns:region:account:name` rather than
 * anything with a `topic/` in it.
 */
export function snsTopicArnPrefix(
  accountRegionScope: SimAwsAccountRegionScope,
): string {
  const { regionName, accountId } = accountRegionScope;

  return `arn:aws:sns:${regionName}:${accountId}:`;
}

/**
 * The resource an operation naming no particular topic authorizes against.
 *
 * Real SNS gives ListTopics no topic-level permission, so a policy allowing it
 * names every topic in the account and region rather than one of them.
 */
export function snsAnyTopicArn(
  accountRegionScope: SimAwsAccountRegionScope,
): string {
  return `${snsTopicArnPrefix(accountRegionScope)}*`;
}

/**
 * Where one topic is, in the three facts its ARN carries.
 *
 * The strings are unbranded because the callers that have only read an ARN,
 * rather than been handed a scope, have nothing but strings to offer.
 */
export interface SimSnsTopicLocation {
  readonly regionName: string;
  readonly accountId: string;
  readonly name: string;
}

/**
 * Read a topic ARN into the Region, Account and name it carries.
 *
 * All three matter. An ARN naming another Account or Region reaches nothing in
 * a simulated SNS scope rather than having its name read out and looked up
 * locally, and treating a foreign one as local would let a test pass while the
 * real call crossed a boundary it has no permission for.
 *
 * Nothing is returned for a string that is not a topic ARN, including a
 * subscription ARN, which carries the subscription id as a seventh part.
 */
export function parseSnsTopicArn(
  value: string,
): SimSnsTopicLocation | undefined {
  const parts = value.split(":");

  if (parts.length !== topicArnParts) {
    return undefined;
  }

  const [prefix, partition, service, regionName, accountId, name] = parts;

  if (
    prefix !== "arn" ||
    partition !== topicArnPartition ||
    service !== topicArnService
  ) {
    return undefined;
  }

  if (
    regionName === undefined ||
    regionName === "" ||
    accountId === undefined ||
    accountId === "" ||
    name === undefined ||
    name === ""
  ) {
    return undefined;
  }

  return { regionName, accountId, name };
}

interface SimSnsTopicArnProperties {
  readonly name: SimSnsTopicName;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * The ARN of one simulated topic.
 *
 * SNS requests name a topic by ARN rather than by a URL of its own, so this is
 * the only identifier a caller passes around, and it is what IAM authorizes
 * against.
 */
export class SimSnsTopicArn {
  public readonly name: string;
  public readonly value: string;

  constructor(properties: SimSnsTopicArnProperties) {
    const { name, accountRegionScope } = properties;

    this.name = name.value;
    this.value = snsTopicArnPrefix(accountRegionScope) + name.value;
  }
}
