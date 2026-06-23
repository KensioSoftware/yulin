import type { SimCloudFrontDistributionId } from "../../distribution/sim-cloudfront-distribution.js";

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
  const subdomains = hostname.split(".");
  // E.g. "distro123" "cloudfront" "net" ["sim-aws", "localhost"]
  if (subdomains.length !== 5 && subdomains.length !== 3) {
    return undefined;
  }
  if (
    subdomains[1]?.toLowerCase() !== "cloudfront" ||
    subdomains[2]?.toLowerCase() !== "net"
  ) {
    return undefined;
  }
  /* v8 ignore if -- redundant safety catch */
  if (subdomains[0] === undefined || subdomains[0] === "") {
    return undefined;
  }

  return subdomains[0].toUpperCase() as SimCloudFrontDistributionId;
}
