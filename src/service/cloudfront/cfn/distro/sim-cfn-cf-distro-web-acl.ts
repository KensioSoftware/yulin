import type { SimAws } from "../../../aws/sim-aws.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCloudFrontDistributionConfig } from "../../command/create-distribution/create-distribution.command.js";
import { simCfWebAclArn } from "../../web-acl/sim-cf-distribution-web-acl.js";
import { makeSimCfWebAclResolver } from "../../web-acl/sim-cf-web-acl-resolver.factory.js";

/**
 * The DistributionConfig to deploy, without a `WebACLId` naming a web ACL this
 * simulation does not hold.
 *
 * `CreateDistribution` refuses such a `WebACLId`, as real CloudFront refuses
 * one, and a Distribution deployed from a template is the one place that
 * refusal costs more than it is worth. A stack naming a web ACL from a real
 * account is ordinary. So is one whose web ACL lost a rule this simulation
 * cannot evaluate. Neither says anything about the site the Distribution
 * serves, and a Distribution that failed to deploy takes every request a local
 * dev server and a test suite make with it.
 *
 * So the property is left out and recorded on `stack.ignoredProperties`. The
 * Distribution deploys and serves every request, including the ones the web
 * ACL was written to block. A test that cares reads the record.
 *
 * A `WebACLId` naming a web ACL that is here goes through untouched, wrong
 * scope and all, so a `REGIONAL` web ACL on a Distribution still fails the
 * deployment the way real CloudFront fails it.
 */
export function simCfnCfDistroWithoutAbsentWebAcl(
  resource: SimCfnResource,
  distributionConfig: SimCloudFrontDistributionConfig,
  simAws: SimAws,
): SimCloudFrontDistributionConfig {
  const webAclArn = simCfWebAclArn(distributionConfig);

  if (webAclArn === undefined) {
    return distributionConfig;
  }

  if (makeSimCfWebAclResolver(simAws)(webAclArn) !== undefined) {
    return distributionConfig;
  }

  resource.ignoreProperty(
    "DistributionConfig.WebACLId",
    `web ACL ${webAclArn} is not held by this simulation, so the ` +
      `Distribution is deployed with nothing in front of it and serves every ` +
      `request that web ACL would have decided`,
  );

  return { ...distributionConfig, WebACLId: undefined };
}
