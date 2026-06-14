import type {
  SimCloudFrontCacheBehaviorConfig,
  SimCloudFrontDefaultCacheBehaviorConfig,
  SimCloudFrontMethodList,
} from "../../command/create-distribution/create-distribution.cmd.js";
import type { SimCloudFrontBehavior } from "../../behaviour/sim-cloud-front-behavior.js";
import { assertDefined } from "../../../../util/defined/defined.js";
import type { SimArn } from "../../../aws/arn.js";
import type { SimCloudFrontDistribution } from "../sim-cloudfront-distribution.js";

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
    distribution.addBehavior(
      this.behaviorFromDefaultCacheBehavior(cacheBehavior),
    );
  }

  /**
   * Configure a Cache Behavior on a Distribution.
   */
  configureCacheBehavior(
    distribution: SimCloudFrontDistribution,
    cacheBehavior: SimCloudFrontCacheBehaviorConfig,
  ): void {
    distribution.addBehavior(this.behaviorFromCacheBehavior(cacheBehavior));
  }

  private behaviorFromDefaultCacheBehavior(
    cacheBehavior: SimCloudFrontDefaultCacheBehaviorConfig | undefined,
  ): SimCloudFrontBehavior {
    assertDefined(cacheBehavior, "CloudFront DefaultCacheBehavior");

    return {
      targetOriginName: this.requiredTargetOriginId(
        cacheBehavior.TargetOriginId,
      ),
      allowedMethods: this.methods(cacheBehavior.AllowedMethods, [
        "GET",
        "HEAD",
      ]),
      cachedMethods: this.methods(cacheBehavior.AllowedMethods?.CachedMethods, [
        "GET",
        "HEAD",
      ]),
      ...(cacheBehavior.ViewerProtocolPolicy === undefined
        ? {}
        : { viewerProtocolPolicy: cacheBehavior.ViewerProtocolPolicy }),
      functionAssociations:
        this.functionAssociationsFromCacheBehavior(cacheBehavior),
    };
  }

  private behaviorFromCacheBehavior(
    cacheBehavior: SimCloudFrontCacheBehaviorConfig,
  ): SimCloudFrontBehavior {
    assertDefined(
      cacheBehavior.PathPattern,
      "CloudFront CacheBehavior PathPattern",
    );

    return {
      pathPattern: cacheBehavior.PathPattern,
      targetOriginName: this.requiredTargetOriginId(
        cacheBehavior.TargetOriginId,
      ),
      allowedMethods: this.methods(cacheBehavior.AllowedMethods, [
        "GET",
        "HEAD",
      ]),
      cachedMethods: this.methods(cacheBehavior.AllowedMethods?.CachedMethods, [
        "GET",
        "HEAD",
      ]),
      ...(cacheBehavior.ViewerProtocolPolicy === undefined
        ? {}
        : { viewerProtocolPolicy: cacheBehavior.ViewerProtocolPolicy }),
      functionAssociations:
        this.functionAssociationsFromCacheBehavior(cacheBehavior),
    };
  }

  private functionAssociationsFromCacheBehavior(
    cacheBehavior:
      | SimCloudFrontDefaultCacheBehaviorConfig
      | SimCloudFrontCacheBehaviorConfig,
  ): SimCloudFrontBehavior["functionAssociations"] | undefined {
    if (cacheBehavior.FunctionAssociations?.Items === undefined) {
      return undefined;
    }
    const associations: SimCloudFrontBehavior["functionAssociations"] = {};

    for (const funcAssoc of cacheBehavior.FunctionAssociations.Items) {
      assertDefined(
        funcAssoc.EventType,
        "CloudFront Function association EventType",
      );
      assertDefined(
        funcAssoc.FunctionARN,
        "CloudFront Function association FunctionARN",
      );
      switch (funcAssoc.EventType) {
        case "viewer-request": {
          associations.viewerRequest = funcAssoc.FunctionARN as SimArn;
          break;
        }
        case "viewer-response": {
          associations.viewerResponse = funcAssoc.FunctionARN as SimArn;
          break;
        }
        case "origin-request": {
          throw new Error(
            "CloudFront Function association EventType origin-request not implemented",
          );
        }
        case "origin-response": {
          throw new Error(
            "CloudFront Function association EventType origin-response not implemented",
          );
        }
      }
    }

    return Object.keys(associations).length > 0 ? associations : undefined;
  }

  private requiredTargetOriginId(targetOriginId: string | undefined): string {
    assertDefined(targetOriginId, "CloudFront CacheBehavior TargetOriginId");

    return targetOriginId;
  }

  private methods(
    methods: SimCloudFrontMethodList | undefined,
    fallback: string[],
  ): Set<string> {
    return new Set(methods?.Items ?? fallback);
  }
}
