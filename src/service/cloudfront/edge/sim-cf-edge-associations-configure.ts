import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimArn } from "../../aws/arn.js";
import type {
  SimCloudFrontCacheBehaviorConfig,
  SimCloudFrontDefaultCacheBehaviorConfig,
} from "../command/create-distribution/create-distribution.command.js";
import type { SimCfEdgeAssociations } from "./sim-cf-edge-association.js";

/**
 * Configure the Lambda@Edge associations of one cache Behavior.
 *
 * Returns undefined where the Behavior associates none. A Behavior without an
 * edge function carries no empty object describing that.
 *
 * Only the two viewer events are mapped. An association on an origin event has
 * already been refused by `SimCfEdgeAssociationValidator`, which runs before
 * any Distribution state is touched.
 */
export function configureEdgeAssociations(
  cacheBehavior:
    | SimCloudFrontDefaultCacheBehaviorConfig
    | SimCloudFrontCacheBehaviorConfig,
): SimCfEdgeAssociations | undefined {
  const items = cacheBehavior.LambdaFunctionAssociations?.Items;

  if (items === undefined) {
    return undefined;
  }

  const associations: {
    -readonly [Key in keyof SimCfEdgeAssociations]: SimCfEdgeAssociations[Key];
  } = {};

  for (const association of items) {
    const { EventType, LambdaFunctionARN, IncludeBody } = association;

    assertDefined(EventType, "Lambda@Edge association EventType");
    assertDefined(
      LambdaFunctionARN,
      "Lambda@Edge association LambdaFunctionARN",
    );

    const configured = {
      functionArn: LambdaFunctionARN as SimArn,
      includeBody: IncludeBody ?? false,
    };

    if (EventType === "viewer-request") {
      associations.viewerRequest = configured;
      continue;
    }

    if (EventType === "viewer-response") {
      associations.viewerResponse = configured;
    }
  }

  return Object.keys(associations).length > 0 ? associations : undefined;
}
