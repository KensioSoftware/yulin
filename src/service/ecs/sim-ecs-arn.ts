import type { AwsRegionName } from "../aws/sim-aws-region.js";
import type { SimAwsAccountId } from "../aws/sim-aws-account.js";

/**
 * The parts of an ECS ARN that say what it names.
 */
export interface SimEcsArnParts {
  readonly region: AwsRegionName;
  readonly accountId: SimAwsAccountId;
  readonly resourceType: string;
  readonly resourceId: string;
}

/**
 * Read an ECS ARN.
 *
 * ECS has its own reader rather than using the shared one because a task
 * definition ARN carries a colon inside its resource part, in
 * `task-definition/family:revision`. The shared reader stops at the sixth
 * colon, which would cut the revision off the end and leave every revision of
 * a family looking like the same ARN.
 *
 * Undefined means the value does not name an ECS resource, which is an
 * ordinary case here: identifiers reach ECS from user input, where a value
 * that is not an ARN at all is something each caller reports in its own terms.
 */
export function parseSimEcsArn(value: string): SimEcsArnParts | undefined {
  const [arnPrefix, partition, service, region, accountId, ...rest] =
    value.split(":");
  const resource = rest.join(":");
  const separatorIndex = resource.indexOf("/");

  if (
    arnPrefix !== "arn" ||
    partition !== "aws" ||
    service !== "ecs" ||
    region === undefined ||
    accountId === undefined ||
    separatorIndex === -1
  ) {
    return undefined;
  }

  return {
    region: region as AwsRegionName,
    accountId: accountId as SimAwsAccountId,
    resourceType: resource.slice(0, separatorIndex),
    resourceId: resource.slice(separatorIndex + 1),
  };
}
