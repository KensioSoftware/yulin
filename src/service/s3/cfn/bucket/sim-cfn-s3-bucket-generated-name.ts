import { SimCfnGeneratedResourceName } from "../../../cloudformation/resource/name/sim-cfn-generated-resource-name.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";

/**
 * The longest name S3 accepts, which `validateS3BucketName` applies in full.
 */
const maximumNameLength = 63;

/**
 * The name CloudFormation gives a Bucket whose template does not name it.
 *
 * Sixty-three characters is short for a name made of a stack name and a logical
 * ID, so `SimCfnGeneratedResourceName` usually has to trim one. It is lower
 * cased afterwards because a bucket name is lowercase and a stack name and a
 * logical ID are usually not. Every character left is one a bucket name allows.
 * A logical ID is alphanumeric, a stack name adds only hyphens, and the tail is
 * hex.
 */
export function simCfnS3BucketGeneratedName(resource: SimCfnResource): string {
  return new SimCfnGeneratedResourceName({
    stackName: resource.stackName,
    logicalId: resource.logicalId,
    maximumLength: maximumNameLength,
  }).value.toLowerCase();
}
