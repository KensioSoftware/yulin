import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import { SimIamAccessDenied } from "../../iam/error/sim-iam.error.js";
import { IamRoleArnParser } from "../../iam/role/arn/sim-iam-role-arn-parser.js";
import type { SimIam } from "../../iam/sim-iam.js";
import { AssumeRoleTrustPolicyAuthorizer } from "../auth-z/assume-role-trust-policy-authorizer.js";

/**
 * Which IAM a role ARN belongs to, and what the role is called there.
 */
export interface SimServiceRoleTarget {
  readonly accountId: SimAwsAccountId;
  readonly roleName: string;
  readonly roleArn: string;
}

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
   * The IAM of the role's own Account, which is not always the target's.
   */
  readonly iam: SimIam;

  readonly refusals: SimServiceRoleRefusals;
}

/**
 * Read the Account and name out of a role ARN a service will assume.
 *
 * The ARN is checked for being a role ARN where the request that carried it was
 * written, so this is reading a known shape rather than validating an unknown
 * one.
 */
export function simServiceRoleTarget(roleArn: string): SimServiceRoleTarget {
  const parts = new IamRoleArnParser().parse(roleArn);

  return { accountId: parts.accountId, roleName: parts.roleName, roleArn };
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
  const { target, servicePrincipal, sessionName, iam, refusals } = assumption;
  const role = await roleOrRefuse(target, iam, refusals);

  try {
    new AssumeRoleTrustPolicyAuthorizer().authorize({
      roleArn: target.roleArn,
      role,
      targetIam: iam,
      caller: { kind: "service", service: servicePrincipal },
    });
  } catch (error) {
    if (error instanceof SimIamAccessDenied) {
      throw refusals.untrustedRole(target, servicePrincipal);
    }

    throw error;
  }

  return {
    kind: "resolved",
    principal: {
      kind: "arn",
      arn: `arn:aws:sts::${target.accountId}:assumed-role/${target.roleName}/${sessionName}`,
    },
    identityPolicyPrincipal: { kind: "arn", arn: target.roleArn },
  };
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
