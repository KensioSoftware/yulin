import type { SimAwsAccountId } from "../../aws/sim-aws-account-id.js";
import type { AwsRegionName } from "../../aws/sim-aws-region.js";
import { SimEventBridgeValidationException } from "../error/sim-event-bridge.error.js";

/**
 * The services a simulated rule can send an event to.
 */
export const simEventTargetServices = ["lambda", "sqs", "sns"] as const;

export type SimEventTargetService = (typeof simEventTargetServices)[number];

/**
 * The fewest colon separated parts any target ARN has.
 */
const minimumArnParts = 6;

/**
 * The same set as strings, for asking whether an arbitrary service name is one
 * of them.
 */
const targetServices: ReadonlySet<string> = new Set(simEventTargetServices);

/**
 * Whether a service name is one this simulation delivers to.
 */
function isTargetService(value: string): value is SimEventTargetService {
  return targetServices.has(value);
}

interface SimEventTargetArnProperties {
  readonly value: string;
  readonly service: SimEventTargetService;
  readonly regionName: AwsRegionName;
  readonly accountId: SimAwsAccountId;
  readonly resource: string;
}

/**
 * The ARN of somewhere a rule sends events.
 *
 * Target ARNs are read here rather than by `parseSimArn`, because the three
 * services this delivers to write their resource part three ways: a queue and
 * a topic put the name straight after the Account with no type in front of it,
 * and a function writes `function:<name>`.
 *
 * A target in another Account or Region is allowed, as real EventBridge
 * delivers across both.
 */
export class SimEventTargetArn {
  public readonly value: string;
  public readonly service: SimEventTargetService;
  public readonly regionName: AwsRegionName;
  public readonly accountId: SimAwsAccountId;

  /**
   * The resource part of the ARN, with no type separator taken off it.
   */
  public readonly resource: string;

  private constructor(properties: SimEventTargetArnProperties) {
    this.value = properties.value;
    this.service = properties.service;
    this.regionName = properties.regionName;
    this.accountId = properties.accountId;
    this.resource = properties.resource;
  }

  /**
   * Read a target ARN, refusing one this simulation cannot deliver to.
   *
   * An ARN naming a service that is not simulated as a target is refused when
   * the target is added rather than when an event first matches, so a rule
   * that cannot work says so at the point it was written.
   */
  static of(value: string | undefined): SimEventTargetArn {
    if (value === undefined || value === "") {
      throw new SimEventBridgeValidationException(
        "Invalid parameter: Target Arn is required",
      );
    }

    const parts = value.split(":");
    const [prefix, partition, service, regionName, accountId] = parts;
    const resource = parts.slice(minimumArnParts - 1).join(":");

    // Every part after a split is a string, so each one has to be checked for
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
      throw new SimEventBridgeValidationException(
        `Invalid parameter: Target Arn Reason: ${value} is not an ARN`,
      );
    }

    if (!isTargetService(service)) {
      throw new SimEventBridgeValidationException(
        `Target ${value} names ${service}, and simulated EventBridge rules ` +
          `deliver to ${simEventTargetServices.join(", ")} targets only.`,
      );
    }

    // Branded at the parse boundary, the way every other ARN reader in the
    // simulator does it: what came off the wire is a string, and this is where
    // it becomes a scope the rest of the simulation can be asked about.
    const arn = new this({
      value,
      service,
      regionName: regionName as AwsRegionName,
      accountId: accountId as SimAwsAccountId,
      resource,
    });

    if (arn.service === "lambda" && arn.functionName === "") {
      throw new SimEventBridgeValidationException(
        `Invalid parameter: Target Arn Reason: ${value} names no function. ` +
          `A function ARN is ` +
          `arn:aws:lambda:<region>:<account-id>:function:<function-name>`,
      );
    }

    return arn;
  }

  /**
   * The name of a Lambda function this ARN names.
   *
   * A function ARN's resource is `function:<name>`, and may carry a version or
   * alias after a second colon, which this simulation does not model and so
   * reads as part of nothing.
   */
  get functionName(): string {
    return this.resource.split(":", 2)[1] ?? "";
  }
}
