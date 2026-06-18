import type {
  SimCloudFrontDistribution,
  SimCloudFrontDistributionId,
} from "../distribution/sim-cloudfront-distribution.js";
import { assertNotNull } from "../../../util/type-guard/defined.js";
import { SimAwsLocalUrl } from "../../../serve/http/sim-aws-local-url.js";
import type { SimCloudFront } from "../sim-cloudfront.js";
import type { SimCloudFrontRegistry } from "../sim-cloud-front-registry.js";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";

export interface SimCloudFrontDistroRoute {
  readonly cloudFront: SimCloudFront;
  readonly distribution: SimCloudFrontDistribution;
}

interface SimCloudFrontDistroRouterProps {
  readonly simAws?: SimAws;
  readonly cloudFrontRegistry?: SimCloudFrontRegistry;
  readonly distributions?: ReadonlyMap<
    SimCloudFrontDistributionId,
    SimCloudFrontDistribution
  >;
}

/**
 * Routes sim CloudFront requests to the appropriate sim Distribution.
 * Owns the Distribution lookup decision.
 */
export class SimCloudFrontDistroRouter {
  private readonly simAws: SimAws;
  private readonly cloudFrontRegistry: SimCloudFrontRegistry;
  private readonly distributions?: ReadonlyMap<
    SimCloudFrontDistributionId,
    SimCloudFrontDistribution
  >;

  constructor(props: SimCloudFrontDistroRouterProps = {}) {
    this.simAws = props.simAws ?? new SimAws();
    this.cloudFrontRegistry =
      props.cloudFrontRegistry ?? this.simAws._cloudFrontRegistry();
    this.distributions = props.distributions ?? new Map();
  }

  /**
   * Construct from an array of Distributions instead of a Map.
   */
  static fromDistributions(
    distributions: SimCloudFrontDistribution[],
  ): SimCloudFrontDistroRouter {
    return new SimCloudFrontDistroRouter({
      distributions: new Map(
        distributions.map((distro) => [distro.distributionId, distro]),
      ),
    });
  }

  /**
   * Select the appropriate CloudFront route for a request.
   */
  routeForRequest(req: Request): SimCloudFrontDistroRoute | undefined {
    const hostname = req.headers.get("host") ?? new URL(req.url).hostname;
    assertNotNull(hostname, "distroForRequest.req.headers.host");
    const simUrl = new SimAwsLocalUrl({ input: `http://${hostname}/` });
    const baseHostname = simUrl.withoutLocalhostSuffix().hostname;

    const distributionId =
      SimCloudFrontDistroRouter.extractHostDistroId(baseHostname);
    if (distributionId !== undefined) {
      return this.routeForDistributionId(distributionId);
    }

    return this.routeForAlternateDomainName(baseHostname);
  }

  /**
   * Select the appropriate Distribution for a request.
   */
  distroForRequest(req: Request): SimCloudFrontDistribution | undefined {
    return this.routeForRequest(req)?.distribution;
  }

  private routeForDistributionId(
    distributionId: SimCloudFrontDistributionId,
  ): SimCloudFrontDistroRoute | undefined {
    const fallbackDistribution = this.distributions?.get(distributionId);
    if (fallbackDistribution !== undefined) {
      return {
        cloudFront: this.cloudFrontForAccount(fallbackDistribution.accountId),
        distribution: fallbackDistribution,
      };
    }

    const accountId =
      this.cloudFrontRegistry.accountIdForDistribution(distributionId);
    if (accountId === undefined) {
      return undefined;
    }

    const cloudFront = this.cloudFrontForAccount(accountId);
    const distribution = cloudFront.getDistributions().get(distributionId);

    if (distribution === undefined) {
      return undefined;
    }

    return { cloudFront, distribution };
  }

  private routeForAlternateDomainName(
    alternateDomainName: string,
  ): SimCloudFrontDistroRoute | undefined {
    if (this.distributions !== undefined) {
      const distribution = [...this.distributions.values()].find((distro) =>
        distro.hasAlternateDomainName(alternateDomainName),
      );

      if (distribution !== undefined) {
        return {
          cloudFront: this.cloudFrontForAccount(distribution.accountId),
          distribution,
        };
      }
    }

    for (const accountId of this.cloudFrontRegistry.accountIdsWithDistributions()) {
      const cloudFront = this.cloudFrontForAccount(accountId);
      const distribution = [...cloudFront.getDistributions().values()].find(
        (distro) => distro.hasAlternateDomainName(alternateDomainName),
      );

      if (distribution !== undefined) {
        return { cloudFront, distribution };
      }
    }

    return undefined;
  }

  private cloudFrontForAccount(accountId: SimAwsAccountId): SimCloudFront {
    return this.simAws.accountRegionScope(accountId).cloudFront();
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
