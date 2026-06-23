import type {
  SimCloudFrontDistribution,
  SimCloudFrontDistributionId,
} from "../distribution/sim-cloudfront-distribution.js";
import { assertNotNull } from "../../../util/type-guard/defined.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import type { SimCloudFront } from "../sim-cloudfront.js";
import type { SimCloudFrontRegistry } from "../registry/sim-cloud-front-registry.js";
import { SimAws } from "../../aws/sim-aws.js";
import { extractCloudFrontHostDistroId } from "./distro-id/extract-cf-host-distro-id.js";
import { SimCloudFrontAlternateDomainRouter } from "./alternate-domain/sim-cf-alternate-domain-router.js";
import { SimCloudFrontDistroIdRouter } from "./distro-id/sim-cf-distro-id-router.js";

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
 *
 * Routing is attempted in priority order:
 * 1. CloudFront hostname (e.g. `<id>.cloudfront.net`) — handled by SimCloudFrontDistroIdRouter.
 * 2. Alternate domain name (e.g. `cdn.example.com`) — handled by SimCloudFrontAlternateDomainRouter.
 */
export class SimCloudFrontDistroRouter {
  private readonly simAws: SimAws;
  private readonly alternateDomainRouter: SimCloudFrontAlternateDomainRouter;
  private readonly distroIdRouter: SimCloudFrontDistroIdRouter;

  constructor(props: SimCloudFrontDistroRouterProps = {}) {
    this.simAws = props.simAws ?? new SimAws();
    const cloudFrontRegistry =
      props.cloudFrontRegistry ?? this.simAws._cloudFrontRegistry();
    const distributions = props.distributions ?? new Map();

    // Both sub-routers share the same SimAws, Registry and Distributions
    // snapshot so their lookups stay consistent within a single request.
    this.alternateDomainRouter = new SimCloudFrontAlternateDomainRouter({
      simAws: this.simAws,
      cloudFrontRegistry,
      distributions,
    });
    this.distroIdRouter = new SimCloudFrontDistroIdRouter({
      simAws: this.simAws,
      cloudFrontRegistry,
      distributions,
    });
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
   *
   * Prefers the Host header over the URL hostname, then strips the
   * `.sim-aws.localhost` suffix so both real and sim-local hostnames
   * are handled identically.
   */
  routeForRequest(req: Request): SimCloudFrontDistroRoute | undefined {
    const hostname = req.headers.get("host") ?? new URL(req.url).hostname;
    assertNotNull(hostname, "distroForRequest.req.headers.host");
    const simUrl = new SimAwsLocalUrl({ input: `http://${hostname}/` });
    const baseHostname = simUrl.withoutLocalhostSuffix().hostname;

    const distributionId = extractCloudFrontHostDistroId(baseHostname);
    if (distributionId !== undefined) {
      return this.distroIdRouter.routeForDistributionId(distributionId);
    }

    return this.alternateDomainRouter.routeForAlternateDomainName(baseHostname);
  }

  /**
   * Select the appropriate Distribution for a request.
   */
  distroForRequest(req: Request): SimCloudFrontDistribution | undefined {
    return this.routeForRequest(req)?.distribution;
  }
}
