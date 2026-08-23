import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimArn } from "../../aws/arn.js";
import type {
  SimCloudFrontCacheBehaviorConfig,
  SimCloudFrontDefaultCacheBehaviorConfig,
} from "../command/create-distribution/create-distribution.command.js";
import type {
  SimCfEdgeAssociation,
  SimCfEdgeAssociations,
} from "./sim-cf-edge-association.js";
import type { SimulatedEdgeEventType } from "./sim-cf-edge-association-checks.js";

/**
 * Configure the Lambda@Edge associations of one cache Behavior.
 *
 * Returns undefined where the Behavior associates none. A Behavior without an
 * edge function carries no empty object describing that.
 *
 * All four event types are mapped. An event type CloudFront has no such event
 * for has already been refused by `SimCfEdgeAssociationValidator`, which runs
 * before any Distribution state is touched.
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

  let associations: SimCfEdgeAssociations = {};

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

    associations = {
      ...associations,
      ...associationFor(EventType, configured),
    };
  }

  return Object.keys(associations).length > 0 ? associations : undefined;
}

/**
 * The association an event type is held under.
 */
function associationFor(
  eventType: SimulatedEdgeEventType,
  association: SimCfEdgeAssociation,
): SimCfEdgeAssociations {
  switch (eventType) {
    case "viewer-request": {
      return { viewerRequest: association };
    }
    case "origin-request": {
      return { originRequest: association };
    }
    case "origin-response": {
      return { originResponse: association };
    }
    case "viewer-response": {
      return { viewerResponse: association };
    }
  }
}
