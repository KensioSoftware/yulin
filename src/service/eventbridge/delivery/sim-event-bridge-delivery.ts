import type { SimEventBridgeEvent } from "../event/sim-event-bridge-event.js";
import type { SimEventTarget } from "../target/sim-event-target.js";

/**
 * The service principal simulated EventBridge reaches another service as.
 *
 * This is the principal a target's resource policy has to admit, which is why
 * a queue targeted by a rule needs `events.amazonaws.com` in its policy and a
 * function needs it in an `AddPermission` grant.
 */
export const simEventBridgeServicePrincipal = "events.amazonaws.com";

/**
 * One event on its way from a rule to one of its targets.
 *
 * The rule comes along because the target's policy is nearly always
 * conditioned on it: a queue admits `events.amazonaws.com` for one rule ARN
 * rather than for EventBridge at large, which is what `aws:SourceArn` carries.
 */
export interface SimEventBridgeDeliveryRequest {
  readonly target: SimEventTarget;
  readonly event: SimEventBridgeEvent;
  readonly ruleArn: string;
  readonly ruleName: string;
  readonly ruleOwnerAccountId: string;
}

/**
 * Somewhere a simulated rule can send an event.
 *
 * There is one implementation per target service, because what a target is
 * asked and what it is handed differ by service: a queue receives a message
 * body, a topic receives a published message, and a function receives an
 * invocation payload. A fourth target service adds a fourth implementation
 * rather than a branch in an existing one.
 */
export interface SimEventBridgeDeliveryTargets {
  /**
   * Send one event to a target, refusing if the target does not admit
   * EventBridge.
   */
  deliver(request: SimEventBridgeDeliveryRequest): Promise<void>;
}

/**
 * What a target's policy is asked about, as IAM condition values.
 */
export interface SimEventBridgeDeliverySource {
  readonly sourceArn: string;
  readonly sourceAccount: string;
}

/**
 * Which rule a delivery is being made for, and whose it is.
 */
export function simEventBridgeDeliverySource(
  request: SimEventBridgeDeliveryRequest,
): SimEventBridgeDeliverySource {
  return {
    sourceArn: request.ruleArn,
    sourceAccount: request.ruleOwnerAccountId,
  };
}

/**
 * What a target receives, as the JSON text a queue or a topic carries.
 *
 * Real EventBridge sends `Input` as written, so a target with an `Input` of
 * `"hello"` receives the JSON string rather than the event that triggered it.
 */
export function simEventBridgeDeliveryJson(
  request: SimEventBridgeDeliveryRequest,
): string {
  return request.target.input ?? JSON.stringify(request.event.toEnvelope());
}

/**
 * What a target receives, as the value a Lambda handler is handed.
 *
 * A target's input is known to be JSON, because that is checked when the
 * target is added, so nothing here can fail to read it.
 */
export function simEventBridgeDeliveryDocument(
  request: SimEventBridgeDeliveryRequest,
): unknown {
  if (request.target.input === undefined) {
    return request.event.toEnvelope();
  }

  return JSON.parse(request.target.input);
}
