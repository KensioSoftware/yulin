import { SimCfnGeneratedResourceName } from "../../../cloudformation/resource/name/sim-cfn-generated-resource-name.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";

/**
 * The longest name IAM accepts for a Role or a User. Both take the same
 * length.
 *
 * https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_iam-quotas.html
 */
const maximumPrincipalNameLength = 64;

/** The longest name IAM accepts for a Policy, twice what a Role takes. */
const maximumPolicyNameLength = 128;

/**
 * The name CloudFormation gives a Role or a User whose template does not name
 * it.
 *
 * Sixty-four characters is short for a name made of a stack name and a logical
 * ID, so `SimCfnGeneratedResourceName` usually has to trim one. The case is
 * left alone, since IAM keeps a name as it was given, and every character a
 * stack name or a logical ID is made of is one an IAM name allows.
 */
export function simCfnIamPrincipalGeneratedName(
  resource: SimCfnResource,
): string {
  return generatedName(resource, maximumPrincipalNameLength);
}

/**
 * The name CloudFormation gives a Managed Policy whose template does not name
 * it, under the same rules as a Role's but with twice the room.
 */
export function simCfnIamPolicyGeneratedName(resource: SimCfnResource): string {
  return generatedName(resource, maximumPolicyNameLength);
}

function generatedName(
  resource: SimCfnResource,
  maximumLength: number,
): string {
  return new SimCfnGeneratedResourceName({
    stackName: resource.stackName,
    logicalId: resource.logicalId,
    maximumLength,
  }).value;
}
