import { SimEventBridgeError } from "./sim-event-bridge.error.js";

/**
 * Thrown when a target's own policy does not admit EventBridge.
 *
 * Not an error real EventBridge reports to anybody: a rule whose target
 * refuses the call fails quietly, and the PutEvents that matched it has
 * already answered with an event id. This is thrown inside the delivery so
 * that the failure is recorded and readable, rather than reaching the caller.
 */
export class SimEventBridgeDeliveryNotPermitted extends SimEventBridgeError {
  public override readonly name = "SimEventBridgeDeliveryNotPermitted";
}

/**
 * Thrown when a target ARN names nothing in this simulation.
 *
 * Distinct from a refusal: a policy saying no is a modelled outcome a test may
 * be asking for on purpose, where a target pointing at nothing is a mistake
 * worth being loud about.
 */
export class SimEventBridgeTargetNotFound extends SimEventBridgeError {
  public override readonly name = "SimEventBridgeTargetNotFound";
}
