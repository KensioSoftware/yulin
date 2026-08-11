import type {
  SimCloudFrontCacheBehaviorConfig,
  SimCloudFrontDefaultCacheBehaviorConfig,
  SimCloudFrontMethodList,
} from "../../command/create-distribution/create-distribution.command.js";
import type { SimCloudFrontBehavior } from "../../behaviour/sim-cloud-front-behavior.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCloudFrontDistribution } from "../sim-cloudfront-distribution.js";
import type { SimCloudFrontResponseHeadersPolicyRegistry } from "../../response-headers-policy/sim-cf-response-headers-policy-registry.js";
import { SimCloudFrontInvalidResponseHeadersPolicyId } from "../../error/sim-cloudfront.error.js";
import { configureCffAssociations } from "./sim-cff-associations-configure.js";

/**
 * Applies Cache Behavior configuration to a sim CloudFront Distribution.
 *
 * A Behavior naming a response headers policy this simulation does not hold
 * is refused here, when the Distribution is created or updated, because
 * that is when real CloudFront checks it too. Waiting until a request needs
 * the policy would deploy successfully and only fail later, at the first
 * request that reaches the Behavior, for a mistyped or AWS-managed policy ID
 * that was always going to be wrong.
 */
export class SimCloudFrontBehaviorConfigurator {
  constructor(
    private readonly responseHeadersPolicies: SimCloudFrontResponseHeadersPolicyRegistry,
  ) {}

  /**
   * Configure the default Cache Behavior on a Distribution.
   */
  configureDefaultCacheBehavior(
    distribution: SimCloudFrontDistribution,
    cacheBehavior: SimCloudFrontDefaultCacheBehaviorConfig | undefined,
  ): void {
    assertDefined(cacheBehavior, "CloudFront DefaultCacheBehavior");
    distribution.addBehavior(this.buildBaseBehaviorProperties(cacheBehavior));
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
      ...this.buildBaseBehaviorProperties(cacheBehavior),
    });
  }

  /**
   * Build the shared Behavior properties common to both default and named
   * Cache Behaviors. Callers add their own fields (e.g. pathPattern) on top.
   */
  private buildBaseBehaviorProperties(
    cacheBehavior:
      | SimCloudFrontDefaultCacheBehaviorConfig
      | SimCloudFrontCacheBehaviorConfig,
  ): SimCloudFrontBehavior {
    const { TargetOriginId, ResponseHeadersPolicyId } = cacheBehavior;

    assertDefined(TargetOriginId, "CloudFront CacheBehavior TargetOriginId");

    if (
      ResponseHeadersPolicyId !== undefined &&
      this.responseHeadersPolicies.byId(ResponseHeadersPolicyId) === undefined
    ) {
      throw new SimCloudFrontInvalidResponseHeadersPolicyId(
        `Sim CloudFront Behavior for Origin ${TargetOriginId} names response ` +
          `headers policy ${ResponseHeadersPolicyId}, which does not exist. ` +
          `Only a policy an AWS::CloudFront::ResponseHeadersPolicy Resource ` +
          `created in this simulation can be named, so a managed policy ID, ` +
          `which names a policy AWS owns rather than one a template creates, ` +
          `will not be found.`,
      );
    }

    return {
      targetOriginName: TargetOriginId,
      allowedMethods: methodsSet(cacheBehavior.AllowedMethods, ["GET", "HEAD"]),
      cachedMethods: methodsSet(cacheBehavior.AllowedMethods?.CachedMethods, [
        "GET",
        "HEAD",
      ]),
      ...(cacheBehavior.ViewerProtocolPolicy !== undefined && {
        viewerProtocolPolicy: cacheBehavior.ViewerProtocolPolicy,
      }),
      ...(ResponseHeadersPolicyId !== undefined && {
        responseHeadersPolicyId: ResponseHeadersPolicyId,
      }),
      functionAssociations: configureCffAssociations(cacheBehavior),
    };
  }
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
