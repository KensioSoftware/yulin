import type { SimCloudFrontDistributionConfig } from "../command/create-distribution/create-distribution.command.js";
import { SimCloudFrontInvalidWebAclId } from "../error/sim-cloudfront.error.js";
import type { SimCfWebAclResolver } from "./sim-cf-web-acl.js";

/**
 * The web ACL ARN a DistributionConfig names, or nothing when it names none.
 *
 * An empty `WebACLId` is how CloudFront says there is no web ACL, and it is
 * what CloudFormation emits for a Distribution that was never given one, so it
 * means the same here as an absent one.
 */
export function simCfWebAclArn(
  distributionConfig: SimCloudFrontDistributionConfig,
): string | undefined {
  const webAclId = distributionConfig.WebACLId;

  return webAclId === undefined || webAclId === "" ? undefined : webAclId;
}

/**
 * Refuses a DistributionConfig naming a web ACL that cannot go in front of a
 * Distribution.
 *
 * Real CloudFront checks this when the Distribution is created or updated, so
 * a template naming a mistyped ARN or a `REGIONAL` scope web ACL fails the
 * deploy there too, rather than deploying successfully and answering every
 * request as though there were no web ACL at all.
 */
export class SimCfDistributionWebAcl {
  constructor(private readonly resolve: SimCfWebAclResolver | undefined) {}

  /**
   * Refuse a DistributionConfig whose `WebACLId` names no web ACL this
   * simulation can use, without touching the Distribution.
   *
   * An update replaces a Distribution's whole configuration, so this runs
   * before any of it is torn down: a refusal here leaves the Distribution
   * serving exactly what it served before.
   */
  assertUsable(distributionConfig: SimCloudFrontDistributionConfig): void {
    const webAclArn = simCfWebAclArn(distributionConfig);
    const resolve = this.resolve;

    // A simulated CloudFront built on its own has no simulation around it to
    // find a web ACL in, so there is nothing to check the ARN against.
    if (webAclArn === undefined || resolve === undefined) {
      return;
    }

    const found = resolve(webAclArn);

    if (found === undefined) {
      throw new SimCloudFrontInvalidWebAclId(
        `Sim CloudFront DistributionConfig names web ACL ${webAclArn}, which ` +
          `does not exist. Only a web ACL created in this simulation can be ` +
          `named, so a managed web ACL ARN, or one from a real account, will ` +
          `not be found.`,
      );
    }

    if (found.webAcl.scope !== "CLOUDFRONT") {
      throw new SimCloudFrontInvalidWebAclId(
        `Sim CloudFront DistributionConfig names web ACL ${webAclArn}, which ` +
          `is a ${found.webAcl.scope} scope web ACL. A Distribution takes a ` +
          `CLOUDFRONT scope web ACL, created in us-east-1, and a REGIONAL one ` +
          `goes in front of an API Gateway stage or a load balancer instead.`,
      );
    }
  }
}
