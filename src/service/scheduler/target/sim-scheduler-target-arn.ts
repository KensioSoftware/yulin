import type { SimAwsAccountId } from "../../aws/sim-aws-account-id.js";
import type { AwsRegionName } from "../../aws/sim-aws-region.js";
import { SimSchedulerValidationException } from "../error/sim-scheduler.error.js";

/**
 * The services a simulated schedule can invoke.
 */
export const simSchedulerTargetServices = [
  "lambda",
  "sqs",
  "sns",
  "ecs",
] as const;

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
 * same reason simulated EventBridge does: the services it invokes write their
 * resource part several ways, with a queue and a topic putting the name
 * straight after the Account, a function writing `function:<name>` and a
 * cluster writing `cluster/<name>`.
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

    this.refuseUnnamedResource(arn);

    return arn;
  }

  /**
   * Refuse an ARN of the right service that names nothing in it.
   *
   * Both services whose resource part carries a type are checked, because both
   * write more than one kind of resource: `arn:aws:lambda:...:layer:shared` and
   * `arn:aws:ecs:...:task-definition/orders:3` are well formed ARNs of a
   * service this invokes, and neither names anything a schedule can reach.
   */
  private static refuseUnnamedResource(arn: SimSchedulerTargetArn): void {
    if (arn.service === "lambda" && arn.functionName === "") {
      throw new SimSchedulerValidationException(
        `Invalid parameter: Target Arn Reason: ${arn.value} names no ` +
          `function. A function ARN is ` +
          `arn:aws:lambda:<region>:<account-id>:function:<function-name>`,
      );
    }

    if (arn.service === "ecs" && arn.clusterName === "") {
      throw new SimSchedulerValidationException(
        `Invalid parameter: Target Arn Reason: ${arn.value} names no ` +
          `cluster. An ECS target names the cluster the task runs in, as ` +
          `arn:aws:ecs:<region>:<account-id>:cluster/<cluster-name>, and ` +
          `names its task definition in EcsParameters.`,
      );
    }
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

  /**
   * The name of the ECS cluster this ARN names, or nothing when it names
   * something else in ECS.
   *
   * A cluster ARN's resource is `cluster/<name>`, with a slash rather than the
   * colon Lambda uses. The resource type is checked rather than assumed for the
   * same reason: a task definition is `task-definition/<family>:<revision>` and
   * a task is `task/<cluster>/<id>`, and taking the part after the slash would
   * read either as a cluster that is not there.
   */
  get clusterName(): string {
    const [resourceType, name = ""] = this.resource.split("/", 2);

    return resourceType === "cluster" ? name : "";
  }
}
