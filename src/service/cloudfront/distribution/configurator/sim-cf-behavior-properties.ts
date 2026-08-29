import type {
  SimCloudFrontCacheBehaviorConfig,
  SimCloudFrontDefaultCacheBehaviorConfig,
  SimCloudFrontMethodList,
} from "../../command/create-distribution/create-distribution.command.js";
import type { SimCloudFrontBehavior } from "../../behaviour/sim-cloud-front-behavior.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfBehaviorPolicies } from "./sim-cf-behavior-policies.js";
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
  policies: SimCfBehaviorPolicies,
): SimCloudFrontBehavior {
  const {
    TargetOriginId,
    ResponseHeadersPolicyId,
    CachePolicyId,
    OriginRequestPolicyId,
  } = cacheBehavior;

  assertDefined(TargetOriginId, "CloudFront CacheBehavior TargetOriginId");

  policies.assertExists(cacheBehavior);

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
    ...(CachePolicyId !== undefined && {
      cachePolicyId: CachePolicyId,
    }),
    ...(OriginRequestPolicyId !== undefined && {
      originRequestPolicyId: OriginRequestPolicyId,
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
