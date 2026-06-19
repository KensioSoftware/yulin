import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimArn } from "../../../aws/arn.js";
import type {
  SimCloudFrontCacheBehaviorConfig,
  SimCloudFrontDefaultCacheBehaviorConfig,
} from "../../command/create-distribution/create-distribution.cmd.js";
import type { SimCloudFrontBehavior } from "../../behaviour/sim-cloud-front-behavior.js";

/**
 * Configure a CloudFront Functions Associations map from a Behavior config.
 *
 * Returns undefined when no FunctionAssociations are configured, so callers
 * can omit the property entirely from the resulting Behavior object.
 *
 * Only viewer-request and viewer-response event types are supported; origin-*
 * event types throw because CloudFront Functions cannot run at origin events
 * (only Lambda@Edge can).
 */
export function configureCffAssociations(
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
