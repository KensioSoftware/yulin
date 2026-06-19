import type { SimCloudFrontDistributionId } from "../distribution/sim-cloudfront-distribution.js";

/**
 * Try to extract a CloudFront Distribution ID from a hostname which could
 * start with
 * distro123.cloudfront.net
 * Such as
 * distro123.cloudfront.net.sim-aws.localhost
 */
export function extractCloudFrontHostDistroId(
  hostname: string,
): SimCloudFrontDistributionId | undefined {
  const subdomains = hostname.split(".").slice(0, 3);
  if (subdomains.length !== 3) {
    return undefined;
  }
  if (subdomains[1] !== "cloudfront" || subdomains[2] !== "net") {
    return undefined;
  }
  /* v8 ignore if -- redundant safety */
  if (subdomains[0] === undefined) {
    return undefined;
  }

  return subdomains[0].toUpperCase() as SimCloudFrontDistributionId;
}
