import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import { skippedSimCfnWafWebAclNamed } from "../../../wafv2/cfn/sim-cfn-waf-skipped-web-acl.js";
import type { SimCloudFrontDistributionConfig } from "../../command/create-distribution/create-distribution.command.js";
import { simCfWebAclArn } from "../../web-acl/sim-cf-distribution-web-acl.js";

/**
 * Skips a template Distribution whose web ACL the deployment skipped.
 *
 * Simulated WAFv2 skips a web ACL carrying a rule it cannot evaluate, and a
 * skipped Resource answers `Fn::GetAtt` with a stand-in. A Distribution
 * carrying that stand-in to `CreateDistribution` would be refused for naming a
 * web ACL that does not exist, which would fail the whole stack over a rule in
 * a template beside it.
 *
 * Creating the Distribution without its firewall is the other way to avoid
 * that, and it is worse. Every request the rules were written to block would
 * be served, by a Distribution that looks deployed. A Distribution that is
 * visibly missing misleads nobody.
 *
 * The "Unsupported sim ... CloudFormation" wording marks the Resource as
 * skipped rather than failing the stack.
 */
export class SimCfnCfDistroWebAclSkip {
  /**
   * A skip error when this Distribution's web ACL was skipped, otherwise
   * undefined.
   */
  findSkipError(
    resource: SimCfnResource,
    distributionConfig: SimCloudFrontDistributionConfig,
    resources: ReadonlyMap<string, SimCfnResource>,
  ): Error | undefined {
    const webAclArn = simCfWebAclArn(distributionConfig);

    if (webAclArn === undefined) {
      return undefined;
    }

    const skipped = skippedSimCfnWafWebAclNamed(webAclArn, resource, resources);

    if (skipped === undefined) {
      return undefined;
    }

    return new Error(
      `Unsupported sim CloudFront CloudFormation Resource ` +
        `${resource.logicalId}: the web ACL its WebACLId names, ` +
        `${skipped.logicalId}, was skipped, so the Distribution would serve ` +
        `every request that web ACL was written to block`,
    );
  }
}
