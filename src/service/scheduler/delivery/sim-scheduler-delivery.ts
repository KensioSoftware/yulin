import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimSchedulerSchedule } from "../schedule/sim-scheduler-schedule.js";

/**
 * The service principal Scheduler assumes an execution role as.
 *
 * This is the principal a role's trust policy has to admit, which is what makes
 * `scheduler.amazonaws.com` the thing to put in an `AssumeRolePolicyDocument`
 * for a schedule to work at all.
 */
export const simSchedulerServicePrincipal = "scheduler.amazonaws.com";

/**
 * One schedule on its way to its target.
 *
 * The due instant travels with it because a schedule invokes with whatever its
 * target's `Input` says and nothing about when it fired, so the due time is
 * only of interest to whatever records a failure.
 */
export interface SimSchedulerDeliveryRequest {
  readonly schedule: SimSchedulerSchedule;
  readonly at: Date;
}

/**
 * Somewhere a simulated schedule can invoke.
 *
 * One implementation per target service, because what each is asked and what
 * each is handed differ: a function receives an invocation payload, and a queue
 * and a topic receive a message body.
 */
export interface SimSchedulerDeliveryTargets {
  /**
   * Invoke a schedule's target, refusing if its execution role may not.
   */
  deliver(request: SimSchedulerDeliveryRequest): Promise<void>;

  /**
   * Send an invocation Scheduler has stopped trying to its dead-letter queue.
   */
  deadLetter(request: SimSchedulerDeadLetterRequest): Promise<void>;
}

export type SimSchedulerExhaustedRetryCondition =
  | "MaximumEventAgeInSeconds"
  | "MaximumRetryAttempts";

export interface SimSchedulerDeadLetterRequest {
  readonly delivery: SimSchedulerDeliveryRequest;
  readonly error: unknown;
  readonly retryAttempts: number;
  readonly exhaustedCondition?: SimSchedulerExhaustedRetryCondition | undefined;
}

/**
 * What a target receives, as the JSON text a queue or a topic carries.
 *
 * A schedule has no event of its own, so a target with no `Input` is sent an
 * empty JSON object rather than an envelope describing the schedule. AWS
 * documents that behaviour for a function and says nothing about it for a queue
 * or a topic, so the same answer is used for all three rather than inventing a
 * different one for each.
 */
export function simSchedulerDeliveryJson(
  request: SimSchedulerDeliveryRequest,
): string {
  return request.schedule.target.input ?? "{}";
}

/**
 * What a target receives, as the value a Lambda handler is handed.
 */
export function simSchedulerDeliveryDocument(
  request: SimSchedulerDeliveryRequest,
): unknown {
  const input = request.schedule.target.input;

  if (input === undefined) {
    return {};
  }

  // A target's Input is text rather than JSON as far as AWS is concerned, so
  // one that does not parse is handed over as the string it is instead of
  // failing the invocation.
  try {
    return JSON.parse(input) as unknown;
  } catch {
    return input;
  }
}

/**
 * A schedule's target, and the caller its execution role makes it as.
 */
export interface SimSchedulerAssumedDelivery {
  readonly request: SimSchedulerDeliveryRequest;
  readonly caller: SimAwsCaller;
}
