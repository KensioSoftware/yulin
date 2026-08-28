import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountRegionContainer } from "../../aws/sim-aws-account-region-scope.js";
import { SimIamAccessDenied } from "../../iam/error/sim-iam.error.js";
import type { SimIam } from "../../iam/sim-iam.js";
import { AssumeRoleTrustPolicyAuthorizer } from "../auth-z/assume-role-trust-policy-authorizer.js";
import {
  simServiceRoleConditionContext,
  type SimServiceRoleSource,
} from "./sim-service-role-source.js";
import {
  simServiceRoleCaller,
  type SimServiceRoleTarget,
} from "./sim-service-role-target.js";

/**
 * How a service says that it could not assume a role, in its own words.
 *
 * The two failures are the two that go wrong in a real account, and each
 * service names them differently because each is fixed somewhere different: a
 * schedule that cannot invoke its target and a rule that cannot reach one are
 * the same mechanism and not the same message.
 */
export interface SimServiceRoleRefusals {
  /**
   * There is no such role to assume.
   */
  missingRole(target: SimServiceRoleTarget): Error;

  /**
   * The role is there and does not trust this service.
   */
  untrustedRole(target: SimServiceRoleTarget, servicePrincipal: string): Error;
}

/**
 * What one service assuming a role needs to know.
 */
export interface SimServiceRoleAssumption {
  readonly target: SimServiceRoleTarget;
  readonly servicePrincipal: string;

  /**
   * The session name AWS gives the role this service assumes.
   */
  readonly sessionName: string;

  /**
   * The Account and Region scope the role is assumed in.
   *
   * Its IAM is the role's own Account's, which is not always the target's, and
   * its Region is the one the assume request is made in.
   */
  readonly scope: SimAwsAccountRegionContainer;

  /**
   * Which of the service's own resources the role is assumed for.
   *
   * A service that states one has its trust policy evaluated with
   * `aws:SourceArn` and `aws:SourceAccount` in hand, which is what a role
   * carrying AWS's confused deputy condition needs to be assumable at all.
   */
  readonly source?: SimServiceRoleSource | undefined;

  readonly refusals: SimServiceRoleRefusals;
}

/**
 * Assume a role as a service principal, and answer with the caller it makes.
 *
 * This is what an execution role is: a service reaches a resource as a session
 * of the role rather than as itself, and the role's own policies decide what it
 * may do. So the two things checked here are the two things that go wrong in a
 * real account: whether the role trusts the service at all, and then,
 * separately, whether it may do the thing.
 *
 * The caller carries both principals. The request is attributed to the session,
 * as it is on AWS, while the policies that apply are the role's, which is
 * exactly the split `SimResolvedCaller` exists for.
 */
export async function assumeSimServiceRole(
  assumption: SimServiceRoleAssumption,
): Promise<SimAwsCaller> {
  const { target, servicePrincipal, sessionName, scope, source, refusals } =
    assumption;
  const iam = scope.iam();
  const role = await roleOrRefuse(target, iam, refusals);

  try {
    new AssumeRoleTrustPolicyAuthorizer().authorize({
      roleArn: target.roleArn,
      role,
      targetIam: iam,
      region: scope.accountRegionScope.regionName,
      caller: { kind: "service", service: servicePrincipal },
      conditionContext: simServiceRoleConditionContext(source),
    });
  } catch (error) {
    if (error instanceof SimIamAccessDenied) {
      throw refusals.untrustedRole(target, servicePrincipal);
    }

    throw error;
  }

  return simServiceRoleCaller(target, sessionName);
}

/**
 * Load the role, refusing when it is not there.
 */
async function roleOrRefuse(
  target: SimServiceRoleTarget,
  iam: SimIam,
  refusals: SimServiceRoleRefusals,
): Promise<Awaited<ReturnType<SimIam["getRole"]>>["Role"]> {
  try {
    const found = await iam.getRole({ input: { RoleName: target.roleName } });

    return found.Role;
  } catch {
    throw refusals.missingRole(target);
  }
}
