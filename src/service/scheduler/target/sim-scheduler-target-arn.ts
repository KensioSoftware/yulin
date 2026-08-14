import type { SimAwsAccountId } from "../../aws/sim-aws-account-id.js";
import type { AwsRegionName } from "../../aws/sim-aws-region.js";
import { SimSchedulerValidationException } from "../error/sim-scheduler.error.js";

/**
 * The services a simulated schedule can invoke.
 */
export const simSchedulerTargetServices = ["lambda", "sqs", "sns"] as const;

export type SimSchedulerTargetService =
  (typeof simSchedulerTargetServices)[number];

/**
 * The fewest colon separated parts any target ARN has.
 */
const minimumArnParts = 6;

const targetServices: ReadonlySet<string> = new Set(simSchedulerTargetServices);

function isTargetService(value: string): value is SimSchedulerTargetService {
  return targetServices.has(value);
}

interface SimSchedulerTargetArnProperties {
  readonly value: string;
  readonly service: SimSchedulerTargetService;
  readonly regionName: AwsRegionName;
  readonly accountId: SimAwsAccountId;
  readonly resource: string;
}

/**
 * The ARN of whatever a schedule invokes.
 *
 * This reads target ARNs itself rather than deferring to `parseSimArn`, for the
 * same reason simulated EventBridge does: the three services it invokes write
 * their resource part three ways, with a queue and a topic putting the name
 * straight after the Account and a function writing `function:<name>`.
 *
 * It is deliberately not shared with EventBridge's reader. The two look alike
 * today and are answering different questions: EventBridge refuses an ARN its
 * rules cannot deliver to, and this refuses one Scheduler's much larger target
 * list does not reach here. Sharing would tie two services' supported-target
 * sets together, and they are not the same set on real AWS.
 */
export class SimSchedulerTargetArn {
  public readonly value: string;
  public readonly service: SimSchedulerTargetService;
  public readonly regionName: AwsRegionName;
  public readonly accountId: SimAwsAccountId;

  /**
   * The resource part of the ARN, with no type separator taken off it.
   */
  public readonly resource: string;

  private constructor(properties: SimSchedulerTargetArnProperties) {
    this.value = properties.value;
    this.service = properties.service;
    this.regionName = properties.regionName;
    this.accountId = properties.accountId;
    this.resource = properties.resource;
  }

  /**
   * Read a target ARN, refusing one this simulation cannot invoke.
   *
   * The refusal happens when the schedule is created rather than when it first
   * falls due, so a schedule that cannot work says so at the point it was
   * written rather than an hour of simulated time later.
   */
  static of(value: string | undefined): SimSchedulerTargetArn {
    if (value === undefined || value === "") {
      throw new SimSchedulerValidationException("Target Arn is required");
    }

    const parts = value.split(":");
    const [prefix, partition, service, regionName, accountId] = parts;
    const resource = parts.slice(minimumArnParts - 1).join(":");

    // Every part after a split is a string, so each has to be checked for
    // being empty as well as for being there: `arn:aws:sqs:::` has six parts
    // and names nothing.
    if (
      prefix !== "arn" ||
      partition !== "aws" ||
      service === undefined ||
      regionName === undefined ||
      regionName === "" ||
      accountId === undefined ||
      accountId === "" ||
      resource === "" ||
      parts.length < minimumArnParts
    ) {
      throw new SimSchedulerValidationException(
        `Invalid parameter: Target Arn Reason: ${value} is not an ARN`,
      );
    }

    if (!isTargetService(service)) {
      throw new SimSchedulerValidationException(
        `Target ${value} names ${service}, and simulated Scheduler invokes ` +
          `${simSchedulerTargetServices.join(", ")} targets only.`,
      );
    }

    const arn = new this({
      value,
      service,
      regionName: regionName as AwsRegionName,
      accountId: accountId as SimAwsAccountId,
      resource,
    });

    if (arn.service === "lambda" && arn.functionName === "") {
      throw new SimSchedulerValidationException(
        `Invalid parameter: Target Arn Reason: ${value} names no function. ` +
          `A function ARN is ` +
          `arn:aws:lambda:<region>:<account-id>:function:<function-name>`,
      );
    }

    return arn;
  }

  /**
   * The name of a Lambda function this ARN names, or nothing when it names
   * something else in Lambda.
   *
   * The resource type is checked rather than assumed, because Lambda writes
   * more than functions this way: a layer is `layer:<name>` and an event
   * source mapping is `event-source-mapping:<uuid>`, and taking the part after
   * the first colon would read either as a function that is not there.
   */
  get functionName(): string {
    const [resourceType, name = ""] = this.resource.split(":", 2);

    return resourceType === "function" ? name : "";
  }
}
