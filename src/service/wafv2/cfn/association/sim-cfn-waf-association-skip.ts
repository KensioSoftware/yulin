import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimWafV2 } from "../../sim-wafv2.js";
import { simCfnWafSkippedResourceError } from "../sim-cfn-waf-resource-error.js";
import { wafWebAclAssociationResourceType } from "../sim-cfn-waf-resource-types.js";

/**
 * The error an association naming a web ACL that is not here is skipped with,
 * or nothing when the web ACL is there.
 *
 * An association is the pair of ARNs it holds, and this one has lost half of
 * itself. There is nothing to put in front of the resource, so the association
 * is recorded and stepped over.
 *
 * That covers a template naming a web ACL from a real account, and one whose
 * web ACL is in another Region or another Account. Skipping the association
 * costs the rest of the template nothing, because an association is the only
 * Resource that carries the reference. Whatever it would have gone in front of
 * deploys and serves, unprotected.
 *
 * `AssociateWebACL` refuses the same ARN, as real WAFv2 refuses it. A request
 * that asks for an association gets an answer about that association, and a
 * template asking for twelve Resources gets the eleven that are left.
 */
export function simCfnWafAssociationSkipError(
  wafV2: SimWafV2,
  resource: SimCfnResource,
  webAclArn: string,
): Error | undefined {
  if (wafV2.findWebAclByArn(webAclArn) !== undefined) {
    return undefined;
  }

  return simCfnWafSkippedResourceError(
    wafWebAclAssociationResourceType,
    resource.logicalId,
    `it names web ACL ${webAclArn}, which this simulation does not hold, so ` +
      `there is nothing to put in front of the resource`,
  );
}
