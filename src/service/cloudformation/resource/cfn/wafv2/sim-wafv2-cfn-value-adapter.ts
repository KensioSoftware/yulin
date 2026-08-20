import { SimWafCfnWebAclAssociation } from "../../../../wafv2/cfn/association/sim-cfn-waf-web-acl-association.js";
import { SimWafIpSet } from "../../../../wafv2/ip-set/sim-waf-ip-set.js";
import { SimWafRegexPatternSet } from "../../../../wafv2/regex-pattern-set/sim-waf-regex-pattern-set.js";
import { SimWafWebAcl } from "../../../../wafv2/web-acl/sim-waf-web-acl.js";
import type {
  SimCfnResourceValueAdapterProperties,
  SimCfnServiceValueAdapter,
} from "../sim-cfn-resource-value-adapter.js";
import { SimWafWebAclAssociationCfn } from "./sim-wafv2-association-cfn.js";
import { SimWafSetCfn } from "./sim-wafv2-resource-cfn.js";
import { SimWafWebAclCfn } from "./sim-wafv2-web-acl-cfn.js";

/**
 * The CloudFormation-facing value adapter for a simulated WAFv2 Resource.
 */
export function wafV2ValueAdapter(
  properties: SimCfnResourceValueAdapterProperties,
): SimCfnServiceValueAdapter {
  if (
    properties.type === "AWS::WAFv2::WebACL" &&
    properties.simResource instanceof SimWafWebAcl
  ) {
    return new SimWafWebAclCfn({ webAcl: properties.simResource });
  }

  if (
    properties.type === "AWS::WAFv2::WebACLAssociation" &&
    properties.simResource instanceof SimWafCfnWebAclAssociation
  ) {
    return new SimWafWebAclAssociationCfn({
      association: properties.simResource,
    });
  }

  if (
    properties.type === "AWS::WAFv2::IPSet" &&
    properties.simResource instanceof SimWafIpSet
  ) {
    return new SimWafSetCfn({
      resource: properties.simResource,
      resourceType: properties.type,
    });
  }

  if (
    properties.type === "AWS::WAFv2::RegexPatternSet" &&
    properties.simResource instanceof SimWafRegexPatternSet
  ) {
    return new SimWafSetCfn({
      resource: properties.simResource,
      resourceType: properties.type,
    });
  }

  return undefined;
}
