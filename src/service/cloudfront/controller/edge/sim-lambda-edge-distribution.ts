import type { SimCloudFrontDistribution } from "../../distribution/sim-cloudfront-distribution.js";
import type { SimLambdaEdgeDistributionConfig } from "../../edge/adapter/sim-lambda-edge-event-adapter.js";

/**
 * What an edge function is told about the Distribution it is running for.
 *
 * The domain name is derived the same way the Distribution view derives it, so
 * a handler reading `config.distributionDomainName` sees the hostname
 * `GetDistribution` reports.
 */
export function simCfEdgeDistributionConfig(
  distribution: SimCloudFrontDistribution,
): SimLambdaEdgeDistributionConfig {
  return {
    distributionId: distribution.distributionId,
    distributionDomainName: `${distribution.distributionId.toLowerCase()}.cloudfront.net`,
  };
}
