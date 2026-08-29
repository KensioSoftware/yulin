import type {
  SimCloudFrontCacheBehaviorConfig,
  SimCloudFrontDefaultCacheBehaviorConfig,
} from "../../command/create-distribution/create-distribution.command.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCloudFrontDistribution } from "../sim-cloudfront-distribution.js";
import { simCfBehaviorProperties } from "./sim-cf-behavior-properties.js";
import type { SimCfBehaviorPolicies } from "./sim-cf-behavior-policies.js";

/**
 * Applies Cache Behavior configuration to a sim CloudFront Distribution.
 */
export class SimCloudFrontBehaviorConfigurator {
  constructor(private readonly policies: SimCfBehaviorPolicies) {}

  /**
   * Configure the default Cache Behavior on a Distribution.
   */
  configureDefaultCacheBehavior(
    distribution: SimCloudFrontDistribution,
    cacheBehavior: SimCloudFrontDefaultCacheBehaviorConfig | undefined,
  ): void {
    assertDefined(cacheBehavior, "CloudFront DefaultCacheBehavior");
    distribution.addBehavior(
      simCfBehaviorProperties(cacheBehavior, this.policies),
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
      ...simCfBehaviorProperties(cacheBehavior, this.policies),
    });
  }
}
