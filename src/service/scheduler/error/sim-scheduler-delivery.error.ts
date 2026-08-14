import { SimSchedulerError } from "./sim-scheduler.error.js";

/**
 * A schedule's target is not a simulated resource.
 *
 * Real Scheduler has nowhere to report this to either: the schedule was
 * created against an ARN, and nothing checks that the ARN names anything until
 * the moment of invocation.
 */
export class SimSchedulerTargetNotFound extends SimSchedulerError {
  public override readonly name = "TargetNotFound";
}

/**
 * A schedule's execution role would not have this invocation.
 *
 * Either the role does not trust Scheduler to assume it, or its policies do not
 * allow the action on the target. The two are told apart by the message,
 * because they are fixed in different places: one is the role's trust policy
 * and the other is the policy attached to it.
 */
export class SimSchedulerDeliveryNotPermitted extends SimSchedulerError {
  public override readonly name = "DeliveryNotPermitted";
}
