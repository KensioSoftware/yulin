import type {
  SimAwsCaller,
  SimAwsPrincipal,
} from "../../../aws/caller/sim-aws-caller.js";
import { SimIamCallerIdentifier } from "../../error/sim-iam-caller-identifier.js";
import { SimIamAccessDenied } from "../../error/sim-iam.error.js";
import type { SimIamInterServiceAuthZ } from "../sim-iam-inter-service-auth-z.js";

/**
 * The IAM action a caller handing a Role to a service is authorized for.
 */
const passRoleAction = "iam:PassRole";

/**
 * The condition key naming the service the Role is being handed to.
 */
const passedToServiceKey = "iam:PassedToService";

/**
 * What a service needs to report a Role the caller may not pass.
 */
export interface SimIamPassRoleDenial {
  readonly principal: SimAwsPrincipal;
  readonly roleArn: string;

  /**
   * What else the message should say about why the request was denied, in the
   * sense SimIamAccessDenied uses it.
   */
  readonly reason?: string | undefined;
}

interface SimIamPassRoleAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;

  /**
   * The service principal the Role is being handed to, such as
   * `lambda.amazonaws.com`. This is what `iam:PassedToService` carries.
   */
  readonly passedToService: string;

  /**
   * The error a refusal is reported as.
   *
   * Defaults to the shared IAM AccessDenied. A service reporting its own
   * denials as its own error type supplies one, so a caller catching that type
   * catches a refused Role along with everything else the service refused
   * them.
   */
  readonly denied?: (denial: SimIamPassRoleDenial) => Error;
}

/**
 * Authorizes handing a Role to a simulated service.
 *
 * A service given a Role to keep uses it under its own identity later, so
 * being allowed to create the thing settles only half of the request. AWS asks
 * separately whether the caller may hand that Role over, and the resource of
 * that question is the Role. A scoped deployment role refused `iam:PassRole` is
 * one of the commoner ways a real deployment stops.
 *
 * The Role need not exist. Real IAM decides a request before the service
 * handles it, so a caller with no permission to pass a Role is refused whether
 * or not the ARN names one.
 */
export class SimIamPassRoleAuthorizer {
  private readonly iam: SimIamInterServiceAuthZ;
  private readonly passedToService: string;
  private readonly denied: (denial: SimIamPassRoleDenial) => Error;

  constructor(properties: SimIamPassRoleAuthorizerProperties) {
    this.iam = properties.iam;
    this.passedToService = properties.passedToService;
    this.denied = properties.denied ?? accessDenied;
  }

  /**
   * Ensure the caller may hand this Role to the service.
   *
   * A request naming no Role passes nothing and is left alone. That covers an
   * optional Role, such as the one an update request omits to keep the Role
   * already in place, and saves each call site repeating the check.
   */
  authorize(roleArn: string | undefined, caller?: SimAwsCaller): void {
    if (roleArn === undefined) {
      return;
    }

    const decision = this.iam.authorize({
      action: passRoleAction,
      resource: roleArn,
      conditionContext: { [passedToServiceKey]: this.passedToService },
      caller,
    });

    if (decision.isDenied) {
      throw this.denied({
        principal: decision.caller.principal,
        roleArn,
        reason: decision.denialReason,
      });
    }
  }

  /**
   * Ensure the caller may hand every one of these Roles to the service.
   *
   * A Firehose delivery stream carrying a Role for its destination beside one
   * for its source is what this is for. Each Role is its own question, and the
   * first refusal is the one reported.
   */
  authorizeAll(
    roleArns: readonly (string | undefined)[],
    caller?: SimAwsCaller,
  ): void {
    for (const roleArn of roleArns) {
      this.authorize(roleArn, caller);
    }
  }
}

/**
 * Report a refused Role as the shared IAM AccessDenied.
 */
function accessDenied(denial: SimIamPassRoleDenial): Error {
  return new SimIamAccessDenied({
    principal: denial.principal,
    reason: denial.reason,
    action: passRoleAction,
    resource: denial.roleArn,
  });
}

/**
 * The message a service reports a refused Role with, in AWS's wording.
 *
 * A service reporting denials as its own error type builds its message from
 * this, so a refused Role reads the same however it is reported.
 */
export function simIamPassRoleDenialMessage(
  denial: SimIamPassRoleDenial,
): string {
  const identifier = new SimIamCallerIdentifier().format(denial.principal);

  return (
    `User: ${identifier} is not authorized to perform: ${passRoleAction} on ` +
    `resource: ${denial.roleArn}`
  );
}
