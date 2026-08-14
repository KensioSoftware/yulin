import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamCallerIdentifier } from "../../../iam/error/sim-iam-caller-identifier.js";
import { SimSchedulerAccessDeniedException } from "../../error/sim-scheduler.error.js";
import type { SimSchedulerRequestOptions } from "../sim-scheduler-request-options.js";

/**
 * The resource an action with no resource type authorizes against.
 *
 * `ListSchedules` names no schedule, so IAM evaluates it against `*` and only a
 * policy whose Resource is `*` allows it.
 */
const noResource = "*";

interface SimSchedulerAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies simulated IAM authorization to Scheduler requests.
 *
 * The resource is the schedule ARN, which carries its group:
 * `arn:aws:scheduler:<region>:<account>:schedule/<group>/<name>`. A policy
 * written without the group in it matches nothing here, as it matches nothing
 * on real AWS.
 *
 * This is the caller's own authorization to manage schedules, and is a separate
 * question from whether a schedule's execution role may invoke its target. The
 * second is asked when the schedule fires, against the role rather than the
 * caller, which is why nothing about the target is consulted here.
 */
export class SimSchedulerAuthorizer {
  private readonly iam: SimIamInterServiceAuthZ;
  private readonly callerIdentifier = new SimIamCallerIdentifier();

  constructor(properties: SimSchedulerAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may perform an action on a schedule, named by its ARN.
   *
   * The schedule need not exist: `CreateSchedule` authorizes against the ARN
   * the schedule is about to have.
   */
  authorizeSchedule(
    action: string,
    scheduleArn: string,
    options?: SimSchedulerRequestOptions,
  ): SimAwsResolvedCaller {
    return this.authorizeResource(action, scheduleArn, options);
  }

  /**
   * Ensure the caller may perform an action naming no particular schedule.
   */
  authorizeAnySchedule(
    action: string,
    options?: SimSchedulerRequestOptions,
  ): SimAwsResolvedCaller {
    return this.authorizeResource(action, noResource, options);
  }

  private authorizeResource(
    action: string,
    resource: string,
    options: SimSchedulerRequestOptions | undefined,
  ): SimAwsResolvedCaller {
    const decision = this.iam.authorize({
      action,
      resource,
      caller: options?.caller,
    });

    if (decision.isDenied) {
      const identifier = this.callerIdentifier.format(
        decision.caller.principal,
      );

      throw new SimSchedulerAccessDeniedException(
        `User: ${identifier} is not authorized to perform: ${action} on ` +
          `resource: ${resource}`,
      );
    }

    return decision.caller;
  }
}
