import type {
  SimCloudFrontDistribution,
  SimCloudFrontDistributionId,
} from "../distribution/sim-cloudfront-distribution.js";
import { assertNotNull } from "../../../util/defined/defined.js";
import { SimAwsLocalUrl } from "../../../serve/http/sim-aws-local-url.js";

/**
 * Routes sim CloudFront requests to the appropriate sim Distribution.
 * Owns the Distribution lookup decision.
 */
export class SimCloudFrontDistroRouter {
  constructor(
    private readonly distributions: ReadonlyMap<
      SimCloudFrontDistributionId,
      SimCloudFrontDistribution
    > = new Map(),
  ) {}

  /**
   * Construct from an array of Distributions instead of a Map.
   */
  static fromDistributions(
    distributions: SimCloudFrontDistribution[],
  ): SimCloudFrontDistroRouter {
    return new SimCloudFrontDistroRouter(
      new Map(distributions.map((distro) => [distro.distributionId, distro])),
    );
  }

  /**
   * Select the appropriate Distribution for a request.
   */
  distroForRequest(req: Request): SimCloudFrontDistribution | undefined {
    const hostname = req.headers.get("host") ?? new URL(req.url).hostname;
    assertNotNull(hostname, "distroForRequest.req.headers.host");
    const simUrl = new SimAwsLocalUrl(`http://${hostname}/`);
    const baseHostname = simUrl.withoutLocalhostSuffix().hostname;

    const distributionId =
      SimCloudFrontDistroRouter.extractHostDistroId(baseHostname);
    if (distributionId !== undefined) {
      return this.distributions.get(distributionId);
    }

    const byAlternateDomainName = [...this.distributions.values()].find(
      (distro) => distro.hasAlternateDomainName(baseHostname),
    );
    if (byAlternateDomainName !== undefined) {
      return byAlternateDomainName;
    }

    return undefined;
  }

  /**
   * Try to extract a CloudFront Distribution ID from a hostname which could
   * start with
   * distro123.cloudfront.net
   * Such as
   * distro123.cloudfront.net.sim-aws.localhost
   */
  public static extractHostDistroId(
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
}
