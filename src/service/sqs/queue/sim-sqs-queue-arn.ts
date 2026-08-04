import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimSqsQueueName } from "./sim-sqs-queue-name.js";

/**
 * The part of a queue ARN that comes before the queue's own name.
 *
 * A queue ARN has no resource type separator, so the name follows the account
 * id directly. That is why `parseSimArn` cannot read one, and why an IAM policy
 * resource for a queue is `arn:aws:sqs:region:account:name` rather than
 * anything with a `queue/` in it.
 */
export function sqsQueueArnPrefix(
  accountRegionScope: SimAwsAccountRegionScope,
): string {
  const { regionName, accountId } = accountRegionScope;

  return `arn:aws:sqs:${regionName}:${accountId}:`;
}

/**
 * The resource an operation naming no particular queue authorizes against.
 *
 * Real SQS gives ListQueues no queue-level permission, so a policy allowing it
 * names every queue in the account and region rather than one of them.
 */
export function sqsAnyQueueArn(
  accountRegionScope: SimAwsAccountRegionScope,
): string {
  return `${sqsQueueArnPrefix(accountRegionScope)}*`;
}

/**
 * Where one queue is, in the three facts both its ARN and its URL carry.
 *
 * The strings are unbranded because the callers that have only read an ARN,
 * rather than been handed a scope, have nothing but strings to offer.
 */
export interface SimSqsQueueLocation {
  readonly regionName: string;
  readonly accountId: string;
  readonly name: string;
}

/**
 * The URL SQS requests name a queue by.
 *
 * Anything holding a queue ARN builds the URL here rather than writing the
 * format out again: a simulated service reaching a queue by ARN, an event
 * source mapping polling one, and the queue itself all mean the same URL.
 */
export function sqsQueueUrl(location: SimSqsQueueLocation): string {
  const { regionName, accountId, name } = location;

  return `https://sqs.${regionName}.amazonaws.com/${accountId}/${name}`;
}

interface SimSqsQueueArnProperties {
  readonly name: SimSqsQueueName;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * The ARN and URL of one simulated queue.
 *
 * The two travel together because they carry the same three facts, the region,
 * the account and the name, in two formats: SDK requests name a queue by URL
 * and IAM policies name it by ARN. Building both here keeps them in step.
 */
export class SimSqsQueueArn {
  public readonly name: string;
  public readonly value: string;
  public readonly url: string;

  constructor(properties: SimSqsQueueArnProperties) {
    const { name, accountRegionScope } = properties;

    this.name = name.value;
    this.value = sqsQueueArnPrefix(accountRegionScope) + name.value;
    this.url = sqsQueueUrl({ ...accountRegionScope, name: name.value });
  }
}
