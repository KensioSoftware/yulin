import type { SimAwsAccountId } from "../../aws/sim-aws-account-id.js";
import type { AwsRegionName } from "../../aws/sim-aws-region.js";
import { SimLambdaInvalidParameterValueException } from "../error/sim-lambda.error.js";

/**
 * The services an asynchronous invocation result can be sent to.
 */
export const simLambdaDestinationServices = [
  "sqs",
  "sns",
  "events",
  "lambda",
] as const;

export type SimLambdaDestinationService =
  (typeof simLambdaDestinationServices)[number];

/**
 * The fewest colon separated parts any destination ARN has.
 */
const minimumArnParts = 6;

const destinationServices: ReadonlySet<string> = new Set(
  simLambdaDestinationServices,
);

function isDestinationService(
  value: string,
): value is SimLambdaDestinationService {
  return destinationServices.has(value);
}

interface SimLambdaDestinationArnProperties {
  readonly value: string;
  readonly service: SimLambdaDestinationService;
  readonly regionName: AwsRegionName;
  readonly accountId: SimAwsAccountId;
  readonly resource: string;
}

/**
 * The ARN of somewhere an asynchronous invocation result is sent.
 *
 * Destination ARNs are read here rather than by `parseSimArn`, because the four
 * services write their resource part three ways. A queue and a topic put the
 * name straight after the Account, a function writes `function:<name>`, and an
 * event bus writes `event-bus/<name>`.
 */
export class SimLambdaDestinationArn {
  public readonly value: string;
  public readonly service: SimLambdaDestinationService;
  public readonly regionName: AwsRegionName;
  public readonly accountId: SimAwsAccountId;

  /**
   * The resource part of the ARN, with no type separator taken off it.
   */
  public readonly resource: string;

  private constructor(properties: SimLambdaDestinationArnProperties) {
    this.value = properties.value;
    this.service = properties.service;
    this.regionName = properties.regionName;
    this.accountId = properties.accountId;
    this.resource = properties.resource;
  }

  /**
   * Read a destination ARN, refusing one this simulation cannot send to.
   *
   * A destination naming an unsimulated service is refused when the config is
   * written rather than when an invocation first fails, so a function that
   * could never deliver says so at the point it was set up.
   */
  static of(value: string): SimLambdaDestinationArn {
    const parts = value.split(":");
    const [prefix, partition, service, regionName, accountId] = parts;
    const resource = parts.slice(minimumArnParts - 1).join(":");

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
      throw new SimLambdaInvalidParameterValueException(
        `The destination ARN ${value} is not an ARN.`,
      );
    }

    if (!isDestinationService(service)) {
      throw new SimLambdaInvalidParameterValueException(
        `The destination ARN ${value} names ${service}, and a simulated ` +
          "Lambda invocation result is sent to " +
          `${simLambdaDestinationServices.join(", ")} destinations only.`,
      );
    }

    const arn = new this({
      value,
      service,
      regionName: regionName as AwsRegionName,
      accountId: accountId as SimAwsAccountId,
      resource,
    });
    this.refuseUnnamedResource(arn);

    return arn;
  }

  /**
   * Refuse an ARN of the right service that names nothing in it.
   */
  private static refuseUnnamedResource(arn: SimLambdaDestinationArn): void {
    if (arn.service === "lambda" && arn.functionName === "") {
      throw new SimLambdaInvalidParameterValueException(
        `The destination ARN ${arn.value} names no function. A function ` +
          "destination is " +
          "arn:aws:lambda:<region>:<account-id>:function:<function-name>",
      );
    }

    if (arn.service === "events" && arn.eventBusName === "") {
      throw new SimLambdaInvalidParameterValueException(
        `The destination ARN ${arn.value} names no event bus. An ` +
          "EventBridge destination is " +
          "arn:aws:events:<region>:<account-id>:event-bus/<bus-name>",
      );
    }
  }
  /**
   * The name of a Lambda function this ARN names, or nothing when it names
   * something else in Lambda.
   */
  get functionName(): string {
    const [resourceType, name = ""] = this.resource.split(":", 3);

    return resourceType === "function" ? name : "";
  }

  /**
   * The version or alias this ARN qualified the function with.
   */
  get functionQualifier(): string | undefined {
    const [resourceType, , qualifier] = this.resource.split(":", 3);

    return resourceType === "function" ? qualifier : undefined;
  }

  /**
   * The name of the event bus this ARN names, or nothing when it names
   * something else in EventBridge.
   */
  get eventBusName(): string {
    const [resourceType, name = "", beyond] = this.resource.split("/", 3);

    if (resourceType !== "event-bus" || beyond !== undefined) {
      return "";
    }

    return name;
  }
}
