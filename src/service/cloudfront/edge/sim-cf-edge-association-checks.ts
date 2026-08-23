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

/**
 * The event types this simulation runs a Lambda@Edge function at, which are
 * all four of CloudFront's own.
 */
export type SimulatedEdgeEventType =
  | "viewer-request"
  | "origin-request"
  | "origin-response"
  | "viewer-response";

/**
 * The same event types to match a name against, in the order a request meets
 * them.
 */
const simulatedEdgeEventTypes = new Set<string>([
  "viewer-request",
  "origin-request",
  "origin-response",
  "viewer-response",
] satisfies SimulatedEdgeEventType[]);

type BehaviorConfig =
  | SimCloudFrontDefaultCacheBehaviorConfig
  | SimCloudFrontCacheBehaviorConfig;

/**
 * Refuse an event type CloudFront has no such event for.
 *
 * All four of CloudFront's own event types run here, so what this catches is a
 * name that is not one of them, rather than one this simulation has no hook
 * for.
 */
export function assertSimulatedEventType(
  eventType: string | undefined,
): asserts eventType is SimulatedEdgeEventType {
  if (isSimulatedEdgeEventType(eventType)) {
    return;
  }

  throw new SimCloudFrontInvalidLambdaFunctionAssociation(
    `Sim CloudFront Lambda@Edge association EventType ${eventType} is not a ` +
      `CloudFront event type. A Lambda@Edge function runs at viewer-request, ` +
      `origin-request, origin-response or viewer-response.`,
  );
}

/**
 * Whether this simulation runs a Lambda@Edge function at this event type.
 */
export function isSimulatedEdgeEventType(
  eventType: string | undefined,
): eventType is SimulatedEdgeEventType {
  return eventType !== undefined && simulatedEdgeEventTypes.has(eventType);
}

/**
 * Refuse an association reading a body at an event that carries none.
 *
 * `IncludeBody` is valid at `viewer-request` and `origin-request`, and
 * CloudFront documents it that way. A response event runs once the request has
 * been forwarded, and the event it builds carries no body for the flag to
 * apply to.
 */
export function assertIncludableBody(
  eventType: SimulatedEdgeEventType,
  includeBody: boolean | undefined,
): void {
  if (includeBody !== true) {
    return;
  }

  if (eventType === "viewer-request" || eventType === "origin-request") {
    return;
  }

  throw new SimCloudFrontInvalidLambdaFunctionAssociation(
    `Sim CloudFront Lambda@Edge association for ${eventType} sets ` +
      `IncludeBody. CloudFront takes IncludeBody at viewer-request and ` +
      `origin-request, the events that carry a request body.`,
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

/**
 * Refuse a Behavior associating two functions with one event type.
 *
 * CloudFront takes one edge function per event type. Two entries naming the
 * same one would otherwise be configured last-wins, leaving a Distribution
 * running a function the template did not put first.
 */
export function assertOneFunctionPerEvent(
  seen: Set<string>,
  eventType: string,
): void {
  if (!seen.has(eventType)) {
    seen.add(eventType);
    return;
  }

  throw new SimCloudFrontInvalidLambdaFunctionAssociation(
    `Sim CloudFront cache Behavior associates more than one Lambda@Edge ` +
      `function with ${eventType}. CloudFront takes one edge function per ` +
      `event type.`,
  );
}

/**
 * Refuse an association with no function to run.
 *
 * `LambdaFunctionARN` is required on a real association. Left out, it has to
 * be refused here, because the Behavior configurator reads it well after a
 * Distribution ID has been allocated and the Distribution built.
 */
export function assertAssociatedFunctionArn(
  functionArn: string | undefined,
  eventType: string,
): asserts functionArn is string {
  if (functionArn !== undefined) {
    return;
  }

  throw new SimCloudFrontInvalidLambdaFunctionAssociation(
    `Sim CloudFront Lambda@Edge association for ${eventType} has no ` +
      `LambdaFunctionARN`,
  );
}
