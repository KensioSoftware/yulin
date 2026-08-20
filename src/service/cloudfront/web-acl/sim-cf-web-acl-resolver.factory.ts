import { parseSimArn } from "../../aws/arn.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { SimCfWebAclResolver } from "./sim-cf-web-acl.js";

/**
 * Create a web ACL resolver backed by a simulated AWS environment.
 *
 * A `CLOUDFRONT` scope web ACL is held by the WAFv2 of the Account and Region
 * its ARN names, which is `us-east-1` for every web ACL CloudFront can use.
 * The ARN is read for that scope rather than assumed, so a `REGIONAL` web ACL
 * named here is found in the Region it was created in and refused for what it
 * is, rather than going missing.
 */
export function makeSimCfWebAclResolver(simAws: SimAws): SimCfWebAclResolver {
  return (webAclArn: string) => {
    const arn = parseSimArn(webAclArn);

    if (arn?.service !== "wafv2") {
      return;
    }

    const wafV2 = simAws.accountRegionScope(arn.accountId, arn.region).wafV2();
    const webAcl = wafV2.findWebAclByArn(webAclArn);

    if (webAcl === undefined) {
      return;
    }

    return { wafV2, webAcl };
  };
}
