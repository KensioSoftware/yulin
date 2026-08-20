import type { SimWafWebAcl } from "../../web-acl/sim-waf-web-acl.js";
import type { SimWafWebAclOutput } from "./web-acl.command.js";

/**
 * What the API reports about one web ACL.
 *
 * GetWebACL and GetWebACLForResource both answer with the whole web ACL, so
 * the shape is stated once here rather than in each of them.
 */
export function simWafWebAclOutput(webAcl: SimWafWebAcl): SimWafWebAclOutput {
  const { configuration } = webAcl;

  return {
    Name: webAcl.name,
    Id: webAcl.id,
    ARN: webAcl.arn,
    Capacity: webAcl.capacity,
    LabelNamespace: webAcl.labelNamespace,
    Description: webAcl.description,
    DefaultAction: configuration.defaultAction,
    Rules: configuration.rules ?? [],
    VisibilityConfig: configuration.visibilityConfig,
    CustomResponseBodies: configuration.customResponseBodies,
  };
}
