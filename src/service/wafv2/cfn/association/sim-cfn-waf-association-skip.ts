import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import { simCfnWafSkippedResourceError } from "../sim-cfn-waf-resource-error.js";
import { wafWebAclAssociationResourceType } from "../sim-cfn-waf-resource-types.js";
import { skippedSimCfnWafWebAclNamed } from "../sim-cfn-waf-skipped-web-acl.js";

/**
 * The error an association whose web ACL the deployment skipped is skipped
 * with, or nothing when the web ACL is there.
 *
 * An association is the pair of ARNs it holds, and one of them has gone. There
 * is nothing left to put in front of the resource, so the association is
 * recorded and stepped over alongside the web ACL it named.
 */
export function simCfnWafAssociationSkipError(
  resource: SimCfnResource,
  webAclArn: string,
  resources: ReadonlyMap<string, SimCfnResource>,
): Error | undefined {
  const skipped = skippedSimCfnWafWebAclNamed(webAclArn, resource, resources);

  if (skipped === undefined) {
    return undefined;
  }

  return simCfnWafSkippedResourceError(
    wafWebAclAssociationResourceType,
    resource.logicalId,
    `the web ACL it names, ${skipped.logicalId}, was skipped, so there is ` +
      `nothing to put in front of the resource`,
  );
}
