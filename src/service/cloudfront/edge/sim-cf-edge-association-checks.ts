import type {
  SimCloudFrontCacheBehaviorConfig,
  SimCloudFrontDefaultCacheBehaviorConfig,
} from "../command/create-distribution/create-distribution.command.js";
import { SimCloudFrontInvalidLambdaFunctionAssociation } from "../error/sim-cloudfront.error.js";

/**
 * The checks a Lambda@Edge association needs that read the Behavior config
 * alone, held apart from the validator that also reaches simulated Lambda and
 * simulated IAM.
 */

type BehaviorConfig =
  | SimCloudFrontDefaultCacheBehaviorConfig
  | SimCloudFrontCacheBehaviorConfig;

/**
 * Refuse an event type this simulation has no hook for.
 *
 * CloudFront runs a Lambda@Edge function at all four events, and this runs one
 * at the two viewer events. An origin association is told so here rather than
 * being configured into a Behavior that would never run it.
 */
export function assertSimulatedEventType(eventType: string | undefined): void {
  if (eventType === "viewer-request" || eventType === "viewer-response") {
    return;
  }

  throw new SimCloudFrontInvalidLambdaFunctionAssociation(
    `Sim CloudFront Lambda@Edge association EventType ${eventType} is not ` +
      `simulated. Simulated CloudFront runs a Lambda@Edge function at ` +
      `viewer-request and viewer-response.`,
  );
}

/**
 * Refuse a Behavior that runs both kinds of edge function at the viewer.
 *
 * CloudFront takes one function per event type, and it takes CloudFront
 * Functions and Lambda@Edge together only where the Lambda@Edge function is on
 * an origin event. A viewer-request CloudFront Function alongside a
 * viewer-response Lambda@Edge function is refused too, which is the part of
 * the rule that surprises people.
 */
export function assertNoViewerFunctionMix(behavior: BehaviorConfig): void {
  const cffEvents = (behavior.FunctionAssociations?.Items ?? [])
    .map((association) => association.EventType)
    .filter((eventType) => eventType?.startsWith("viewer-") === true);

  const edgeEvents = (behavior.LambdaFunctionAssociations?.Items ?? [])
    .map((association) => association.EventType)
    .filter((eventType) => eventType?.startsWith("viewer-") === true);

  if (cffEvents.length === 0 || edgeEvents.length === 0) {
    return;
  }

  throw new SimCloudFrontInvalidLambdaFunctionAssociation(
    `Sim CloudFront cache Behavior associates CloudFront Function ` +
      `${cffEvents.join(", ")} and Lambda@Edge ${edgeEvents.join(", ")}. ` +
      `CloudFront does not combine the two kinds of edge function at the ` +
      `viewer events, whether or not they are on the same event type.`,
  );
}
