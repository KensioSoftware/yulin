import { randomUUID } from "node:crypto";
import type { Brand } from "../../../util/brand.type.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { parseSimArn } from "../../aws/arn.js";

/**
 * The unique ID CloudFormation gives a Stack when it creates it.
 *
 * An ARN rather than a name, and a new one every time a Stack of that name is
 * created, which is what lets a deleted Stack still be told apart from the one
 * that took its name.
 */
export type SimCfnStackId = Brand<string, "SimCfnStackId">;

interface SimCfnStackIdProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly stackName: string;
}

/**
 * Make the Stack ID for a Stack being created.
 *
 * The Account and Region are the ones the Stack is being created in, and the
 * UUID on the end is what makes this Stack a different Stack from the last one
 * of the same name.
 */
export function makeSimCfnStackId(
  properties: SimCfnStackIdProperties,
): SimCfnStackId {
  const { accountRegionScope, stackName } = properties;
  const { accountId, regionName } = accountRegionScope;

  return `arn:aws:cloudformation:${regionName}:${accountId}:stack/${stackName}/${randomUUID()}` as SimCfnStackId;
}

/**
 * Whether a value naming a Stack is a Stack ID rather than a Stack name.
 *
 * `DescribeStacks` takes either in `StackName`, so what a caller gave has to be
 * read before it can be looked up.
 */
export function isSimCfnStackId(value: string): boolean {
  const arn = parseSimArn(value);

  return arn?.service === "cloudformation" && arn.resourceType === "stack";
}
