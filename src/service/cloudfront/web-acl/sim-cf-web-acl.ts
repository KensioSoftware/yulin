import type { SimWafV2 } from "../../wafv2/sim-wafv2.js";
import type { SimWafWebAcl } from "../../wafv2/web-acl/sim-waf-web-acl.js";

/**
 * A web ACL a Distribution's `WebACLId` names, and the simulated WAFv2 that
 * holds it.
 *
 * The service comes back with the web ACL because it is what decides a
 * request: `evaluateRequest` is the entry point WAFv2 offers a fronting
 * service, and the web ACL itself is what says whether it can be put in front
 * of a Distribution at all.
 */
export interface SimCfWebAcl {
  readonly wafV2: SimWafV2;
  readonly webAcl: SimWafWebAcl;
}

/**
 * Find the web ACL an ARN names, wherever in the simulation it was created.
 *
 * Nothing means no web ACL of that ARN, which is what a Distribution is
 * refused for. A CloudFront Distribution is created without one more often
 * than with one, so a simulated CloudFront built outside a SimAws has no
 * resolver at all and answers nothing.
 */
export type SimCfWebAclResolver = (
  webAclArn: string,
) => SimCfWebAcl | undefined;
