import { SimSnsError } from "./sim-sns.error.js";

/**
 * Simulated SNS error for an endpoint that would not take a message.
 *
 * Real SNS has no error for this, because it never reports a delivery failure
 * to the caller who published: a publish is answered before anything is
 * delivered. This is what the failure is recorded as instead, so a test that
 * wonders why a queue is empty can find out.
 */
export class SimSnsDeliveryNotPermitted extends SimSnsError {
  public override readonly name = "SimSnsDeliveryNotPermitted";
}
