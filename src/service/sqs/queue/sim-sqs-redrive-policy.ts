import { SimSqsInvalidParameterValue } from "../error/sim-sqs.error.js";
import type { SimSqsQueueAttributeInput } from "./sim-sqs-queue-attributes.js";
import { simSqsRedrivePolicyAttributeName } from "./sim-sqs-queue-attribute-specs.js";

const minimumReceiveCount = 1;
const maximumReceiveCount = 1000;
const integerPattern = /^\d+$/;

/**
 * The error real SQS refuses a redrive policy with.
 *
 * Every reason is reported as one invalid parameter value carrying the policy
 * that was sent, because that is the shape of the message AWS answers with and
 * the whole policy is what has to be corrected.
 */
function invalidPolicy(value: string, reason: string): Error {
  return new SimSqsInvalidParameterValue(
    `Value ${value} for parameter RedrivePolicy is invalid. Reason: ${reason}.`,
  );
}

/**
 * Read a redrive policy string as the JSON map real SQS expects it to be.
 */
function parsedJsonMap(value: string): Readonly<Record<string, unknown>> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw invalidPolicy(value, "Redrive policy is not valid JSON");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw invalidPolicy(value, "Redrive policy is not a JSON object");
  }

  return parsed as Readonly<Record<string, unknown>>;
}

/**
 * Read the dead-letter queue ARN out of a parsed policy.
 */
function parsedTargetArn(
  value: string,
  parsed: Readonly<Record<string, unknown>>,
): string {
  const arn = parsed["deadLetterTargetArn"];

  if (typeof arn !== "string" || arn === "") {
    throw invalidPolicy(
      value,
      "Redrive policy requires a deadLetterTargetArn naming the dead-letter " +
        "queue",
    );
  }

  return arn;
}

/**
 * Read the maximum receive count out of a parsed policy.
 *
 * SQS carries it as a JSON number or as a string holding one. AWS's own
 * documented example sends a string, and CloudFormation sends a number, so both
 * have to be read the same way.
 */
function parsedReceiveCount(
  value: string,
  parsed: Readonly<Record<string, unknown>>,
): number {
  const count = parsed["maxReceiveCount"];
  const range = `${String(minimumReceiveCount)} to ${String(maximumReceiveCount)}`;
  const outOfRange = invalidPolicy(
    value,
    `Value ${String(count)} for maxReceiveCount is invalid. It must be an ` +
      `integer from ${range}`,
  );

  if (typeof count === "string" && integerPattern.test(count)) {
    return inRange(Number(count), outOfRange);
  }

  if (typeof count === "number" && Number.isSafeInteger(count)) {
    return inRange(count, outOfRange);
  }

  throw outOfRange;
}

function inRange(count: number, outOfRange: Error): number {
  if (count < minimumReceiveCount || count > maximumReceiveCount) {
    throw outOfRange;
  }

  return count;
}

interface SimSqsRedrivePolicyProperties {
  readonly value: string;
  readonly deadLetterTargetArn: string;
  readonly maxReceiveCount: number;
}

/**
 * The redrive policy of one simulated queue.
 *
 * It says two things: which queue failed messages go to, and how many receives
 * a message gets before it is one of them. Both are read out of the JSON string
 * SQS carries the attribute as, and the string itself is kept so
 * `GetQueueAttributes` reports back what was set rather than a re-serialised
 * version of it.
 */
export class SimSqsRedrivePolicy {
  public readonly value: string;
  public readonly deadLetterTargetArn: string;
  public readonly maxReceiveCount: number;

  private constructor(properties: SimSqsRedrivePolicyProperties) {
    this.value = properties.value;
    this.deadLetterTargetArn = properties.deadLetterTargetArn;
    this.maxReceiveCount = properties.maxReceiveCount;
  }

  /**
   * Read a redrive policy attribute value, refusing one real SQS would refuse.
   */
  static parse(value: string): SimSqsRedrivePolicy {
    const parsed = parsedJsonMap(value);

    return new this({
      value,
      deadLetterTargetArn: parsedTargetArn(value, parsed),
      maxReceiveCount: parsedReceiveCount(value, parsed),
    });
  }

  /**
   * Whether another policy asks for the same dead-letter queue on the same
   * terms, which is the question a repeated `CreateQueue` asks.
   */
  matches(other: SimSqsRedrivePolicy): boolean {
    return (
      this.deadLetterTargetArn === other.deadLetterTargetArn &&
      this.maxReceiveCount === other.maxReceiveCount
    );
  }
}

/**
 * The redrive policy a request is setting, if it is setting one.
 */
export function simSqsRedrivePolicyIn(
  requested: SimSqsQueueAttributeInput,
): SimSqsRedrivePolicy | undefined {
  // eslint-disable-next-line security/detect-object-injection -- a fixed key.
  const value = requested[simSqsRedrivePolicyAttributeName];

  if (value === undefined) {
    return undefined;
  }

  return SimSqsRedrivePolicy.parse(value);
}
