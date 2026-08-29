import {
  type SimCfCachingConfiguration,
  SimCloudFrontRegistry,
} from "./registry/sim-cloud-front-registry.js";
import { SimCloudFrontPolicies } from "./sim-cloudfront-policies.js";

/**
 * The cache one simulated CloudFront's Distributions hold, and whether they
 * hold one at all.
 *
 * The setting lives on `SimCloudFrontRegistry`, which is built once per
 * `SimAws` and shared by every Account and Region, so a Distribution anywhere
 * in one simulated AWS caches or does not together with the rest.
 * `SimCloudFront` extends this, and a caller reaches it on the one service
 * object.
 */
export class SimCloudFrontCaching extends SimCloudFrontPolicies {
  protected readonly cloudFrontRegistry: SimCloudFrontRegistry;

  constructor(cloudFrontRegistry?: SimCloudFrontRegistry) {
    super();
    this.cloudFrontRegistry = cloudFrontRegistry ?? new SimCloudFrontRegistry();
  }

  /**
   * Whether Distributions in this simulated AWS cache what they serve.
   */
  get cachingEnabled(): boolean {
    return this.cloudFrontRegistry.cachingEnabled;
  }

  /**
   * Turn the edge cache on or off.
   *
   * ```typescript
   * simAws.cloudFront().configureCaching({ enabled: false });
   * ```
   *
   * Caching is on, as CloudFront's is. Turning it off is for a suite that
   * repeats a request and wants every one of them to reach the Origin.
   */
  configureCaching(configuration: SimCfCachingConfiguration): void {
    this.cloudFrontRegistry.configureCaching(configuration);
  }
}
