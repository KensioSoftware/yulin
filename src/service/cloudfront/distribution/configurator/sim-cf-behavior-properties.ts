import type {
  SimCloudFrontCacheBehaviorConfig,
  SimCloudFrontDefaultCacheBehaviorConfig,
  SimCloudFrontMethodList,
} from "../../command/create-distribution/create-distribution.command.js";
import type { SimCloudFrontBehavior } from "../../behaviour/sim-cloud-front-behavior.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfBehaviorResponseHeadersPolicy } from "./sim-cf-behavior-response-headers-policy.js";
import { configureCffAssociations } from "./sim-cff-associations-configure.js";
import { configureEdgeAssociations } from "../../edge/sim-cf-edge-associations-configure.js";
import { assertConsistentQuantity } from "../../command/sim-cf-list-quantity.js";

/**
 * Build the Behavior properties common to both the default Cache Behavior and
 * a named one. Callers add their own fields, such as the path pattern, on top.
 */
export function simCfBehaviorProperties(
  cacheBehavior:
    | SimCloudFrontDefaultCacheBehaviorConfig
    | SimCloudFrontCacheBehaviorConfig,
  responseHeadersPolicy: SimCfBehaviorResponseHeadersPolicy,
): SimCloudFrontBehavior {
  const { TargetOriginId, ResponseHeadersPolicyId } = cacheBehavior;

  assertDefined(TargetOriginId, "CloudFront CacheBehavior TargetOriginId");

  responseHeadersPolicy.assertExists(TargetOriginId, ResponseHeadersPolicyId);

  return {
    targetOriginName: TargetOriginId,
    allowedMethods: methodsSet("AllowedMethods", cacheBehavior.AllowedMethods, [
      "GET",
      "HEAD",
    ]),
    cachedMethods: methodsSet(
      "CachedMethods",
      cacheBehavior.AllowedMethods?.CachedMethods,
      ["GET", "HEAD"],
    ),
    ...(cacheBehavior.ViewerProtocolPolicy !== undefined && {
      viewerProtocolPolicy: cacheBehavior.ViewerProtocolPolicy,
    }),
    ...(ResponseHeadersPolicyId !== undefined && {
      responseHeadersPolicyId: ResponseHeadersPolicyId,
    }),
    functionAssociations: configureCffAssociations(cacheBehavior),
    lambdaFunctionAssociations: configureEdgeAssociations(cacheBehavior),
  };
}

/**
 * Build a Set of HTTP methods from a method list config, falling back to the
 * provided defaults when no items are configured.
 */
function methodsSet(
  listName: string,
  methods: SimCloudFrontMethodList | undefined,
  fallback: string[],
): Set<string> {
  assertConsistentQuantity(listName, methods);

  return new Set(methods?.Items ?? fallback);
}
