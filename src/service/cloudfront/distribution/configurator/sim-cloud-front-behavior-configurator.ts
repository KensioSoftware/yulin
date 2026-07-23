import type {
  SimCloudFrontCacheBehaviorConfig,
  SimCloudFrontDefaultCacheBehaviorConfig,
  SimCloudFrontMethodList,
} from "../../command/create-distribution/create-distribution.cmd.js";
import type { SimCloudFrontBehavior } from "../../behaviour/sim-cloud-front-behavior.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCloudFrontDistribution } from "../sim-cloudfront-distribution.js";
import { configureCffAssociations } from "./sim-cff-associations-configure.js";

/**
 * Applies Cache Behavior configuration to a sim CloudFront Distribution.
 */
export class SimCloudFrontBehaviorConfigurator {
  /**
   * Configure the default Cache Behavior on a Distribution.
   */
  configureDefaultCacheBehavior(
    distribution: SimCloudFrontDistribution,
    cacheBehavior: SimCloudFrontDefaultCacheBehaviorConfig | undefined,
  ): void {
    assertDefined(cacheBehavior, "CloudFront DefaultCacheBehavior");
    distribution.addBehavior(buildBaseBehaviorProperties(cacheBehavior));
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
      ...buildBaseBehaviorProperties(cacheBehavior),
    });
  }
}

/**
 * Build the shared Behavior properties common to both default and named Cache
 * Behaviors. Callers add their own fields (e.g. pathPattern) on top.
 */
function buildBaseBehaviorProperties(
  cacheBehavior:
    SimCloudFrontDefaultCacheBehaviorConfig | SimCloudFrontCacheBehaviorConfig,
): SimCloudFrontBehavior {
  assertDefined(
    cacheBehavior.TargetOriginId,
    "CloudFront CacheBehavior TargetOriginId",
  );

  return {
    targetOriginName: cacheBehavior.TargetOriginId,
    allowedMethods: methodsSet(cacheBehavior.AllowedMethods, ["GET", "HEAD"]),
    cachedMethods: methodsSet(cacheBehavior.AllowedMethods?.CachedMethods, [
      "GET",
      "HEAD",
    ]),
    ...(cacheBehavior.ViewerProtocolPolicy !== undefined && {
      viewerProtocolPolicy: cacheBehavior.ViewerProtocolPolicy,
    }),
    functionAssociations: configureCffAssociations(cacheBehavior),
  };
}

/**
 * Build a Set of HTTP methods from a method list config, falling back to the
 * provided defaults when no items are configured.
 */
function methodsSet(
  methods: SimCloudFrontMethodList | undefined,
  fallback: string[],
): Set<string> {
  return new Set(methods?.Items ?? fallback);
}
