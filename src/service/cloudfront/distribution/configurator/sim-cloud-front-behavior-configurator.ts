import type {
  SimCloudFrontCacheBehaviorConfig,
  SimCloudFrontDefaultCacheBehaviorConfig,
} from "../../command/create-distribution/create-distribution.command.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCloudFrontDistribution } from "../sim-cloudfront-distribution.js";
import { simCfBehaviorProperties } from "./sim-cf-behavior-properties.js";
import type { SimCfBehaviorResponseHeadersPolicy } from "./sim-cf-behavior-response-headers-policy.js";

/**
 * Applies Cache Behavior configuration to a sim CloudFront Distribution.
 */
export class SimCloudFrontBehaviorConfigurator {
  constructor(
    private readonly responseHeadersPolicy: SimCfBehaviorResponseHeadersPolicy,
  ) {}

  /**
   * Configure the default Cache Behavior on a Distribution.
   */
  configureDefaultCacheBehavior(
    distribution: SimCloudFrontDistribution,
    cacheBehavior: SimCloudFrontDefaultCacheBehaviorConfig | undefined,
  ): void {
    assertDefined(cacheBehavior, "CloudFront DefaultCacheBehavior");
    distribution.addBehavior(
      simCfBehaviorProperties(cacheBehavior, this.responseHeadersPolicy),
    );
  }

  /**
   * Configure a Cache Behavior on a Distribution.
   */
  configureCacheBehavior(
    distribution: SimCloudFrontDistribution,
    cacheBehavior: SimCloudFrontCacheBehaviorConfig,
  ): void {
    assertDefined(
      cacheBehavior.PathPattern,
      "CloudFront CacheBehavior PathPattern",
    );
    distribution.addBehavior({
      pathPattern: cacheBehavior.PathPattern,
      ...simCfBehaviorProperties(cacheBehavior, this.responseHeadersPolicy),
    });
  }
}
