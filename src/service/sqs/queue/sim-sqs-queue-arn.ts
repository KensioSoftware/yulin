import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimSqsQueueName } from "./sim-sqs-queue-name.js";
import { SimSqsQueueUrl } from "./sim-sqs-queue-url.js";

/**
 * How a queue ARN is written: no resource type separator, so the queue's name
 * follows the account id directly.
 */
const queueArnPattern =
  /^arn:aws:sqs:(?<regionName>[a-z\d-]+):(?<accountId>\d{12}):(?<name>[\w-]{1,80})$/u;

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

/**
 * The ARN an IAM policy names a queue by.
 */
export function sqsQueueArn(location: SimSqsQueueLocation): string {
  const { regionName, accountId, name } = location;

  return `arn:aws:sqs:${regionName}:${accountId}:${name}`;
}

/**
 * Read the three facts a queue ARN carries, or nothing for a value that is not
 * a queue ARN.
 */
export function parseSqsQueueArn(
  value: string,
): SimSqsQueueLocation | undefined {
  const groups = queueArnPattern.exec(value)?.groups;

  if (groups === undefined) {
    return undefined;
  }

  const { regionName, accountId, name } = groups;

  /* v8 ignore next 3 -- unreachable: a match always fills every named group,
     but the index signature the regex groups come back as cannot say so. */
  if (
    regionName === undefined ||
    accountId === undefined ||
    name === undefined
  ) {
    return undefined;
  }

  return { regionName, accountId, name };
}

/**
 * The URL SQS requests name the queue an ARN names by, refusing a value that
 * is not a queue ARN.
 *
 * Anything holding a queue ARN and about to make an SDK request goes through
 * here, so the two formats are converted in one place rather than wherever a
 * consumer happens to hold the ARN.
 */
export function sqsQueueUrlOf(queueArn: string): string {
  const location = parseSqsQueueArn(queueArn);

  assertDefined(
    location,
    `${queueArn} is not an SQS queue ARN, which is written ` +
      `arn:aws:sqs:<region>:<account-id>:<queue-name>`,
  );

  return sqsQueueUrl(location);
}

/**
 * The ARN naming the queue a URL names, refusing a value that is not a queue
 * URL.
 *
 * A user names a queue by its URL, since that is what `CreateQueue` answers
 * with, and everything that authorizes or watches a queue names it by ARN.
 */
export function sqsQueueArnOf(queueUrl: string): string {
  const location = SimSqsQueueUrl.parse(queueUrl);

  assertDefined(
    location,
    `${queueUrl} is not an SQS queue URL, which is written ` +
      `https://sqs.<region>.amazonaws.com/<account-id>/<queue-name>`,
  );

  return sqsQueueArn(location);
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
