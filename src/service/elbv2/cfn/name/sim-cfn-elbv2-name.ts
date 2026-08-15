import { SimCfnGeneratedResourceName } from "../../../cloudformation/resource/name/sim-cfn-generated-resource-name.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import { maximumSimElbV2NameLength } from "../../sim-elbv2-resource-name.js";

/**
 * The name CloudFormation gives a load balancer or target group whose template
 * does not name it.
 *
 * Both are named under the same rules, so both generate a name the same way.
 * Thirty-two characters is short for a name made of a stack name and a logical
 * ID, so the trimming `SimCfnGeneratedResourceName` does is the usual case
 * here rather than the exception.
 */
export function simCfnElbV2GeneratedName(resource: SimCfnResource): string {
  return new SimCfnGeneratedResourceName({
    stackName: resource.stackName,
    logicalId: resource.logicalId,
    maximumLength: maximumSimElbV2NameLength,
  }).value;
}
