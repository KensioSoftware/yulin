import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import {
  SimIamPassRoleAuthorizer,
  simIamPassRoleDenialMessage,
} from "../../../iam/authorize/pass-role/sim-iam-pass-role-authorizer.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamCallerIdentifier } from "../../../iam/error/sim-iam-caller-identifier.js";
import { simSchedulerServicePrincipal } from "../../delivery/sim-scheduler-delivery.js";
import { SimSchedulerAccessDeniedException } from "../../error/sim-scheduler.error.js";
import type { SimSchedulerRequestOptions } from "../sim-scheduler-request-options.js";

/**
 * The resource an action with no resource type authorizes against.
 *
 * `ListSchedules` and `ListScheduleGroups` name nothing, so IAM evaluates them
 * against `*` and only a policy whose Resource is `*` allows them.
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
 * on real AWS. A group command authorizes against the group's own ARN, which
 * is a different resource path: `schedule-group/<name>`.
 *
 * This is the caller's own authorization to manage schedules, and is a separate
 * question from whether a schedule's execution role may invoke its target. The
 * second is asked when the schedule fires, against the role rather than the
 * caller.
 *
 * A third question is asked here, about the same execution role. A schedule
 * keeps the `Target.RoleArn` it is given and fires as it later, so the caller
 * writing it needs `iam:PassRole` on that Role.
 */
export class SimSchedulerAuthorizer {
  private readonly iam: SimIamInterServiceAuthZ;
  private readonly callerIdentifier = new SimIamCallerIdentifier();
  private readonly passRole: SimIamPassRoleAuthorizer;

  constructor(properties: SimSchedulerAuthorizerProperties) {
    this.iam = properties.iam;
    this.passRole = new SimIamPassRoleAuthorizer({
      iam: properties.iam,
      passedToService: simSchedulerServicePrincipal,
      denied: (denial): Error =>
        new SimSchedulerAccessDeniedException(
          simIamPassRoleDenialMessage(denial),
        ),
    });
  }

  /**
   * Ensure the caller may hand Scheduler a schedule's execution role.
   */
  authorizePassRole(
    roleArn: string | undefined,
    options?: SimSchedulerRequestOptions,
  ): void {
    this.passRole.authorize(roleArn, options?.caller);
  }

  /**
   * Ensure the caller may perform an action on a resource, named by its ARN.
   *
   * The resource need not exist: `CreateSchedule` authorizes against the ARN
   * the schedule is about to have, and `CreateScheduleGroup` against the
   * group's.
   */
  authorizeResource(
    action: string,
    resource: string,
    options?: SimSchedulerRequestOptions,
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

  /**
   * Ensure the caller may perform an action naming no particular resource.
   */
  authorizeAnyResource(
    action: string,
    options?: SimSchedulerRequestOptions,
  ): SimAwsResolvedCaller {
    return this.authorizeResource(action, noResource, options);
  }
}
