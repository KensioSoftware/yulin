import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import { SimIamAccessDenied } from "../../iam/error/sim-iam.error.js";
import { IamRoleArnParser } from "../../iam/role/arn/sim-iam-role-arn-parser.js";
import type { SimIam } from "../../iam/sim-iam.js";
import { AssumeRoleTrustPolicyAuthorizer } from "../../sts/auth-z/assume-role-trust-policy-authorizer.js";
import { SimSchedulerDeliveryNotPermitted } from "../error/sim-scheduler-delivery.error.js";
import { simSchedulerServicePrincipal } from "./sim-scheduler-delivery.js";

/**
 * The session name AWS gives a role Scheduler assumes for an invocation.
 */
const sessionName = "EventBridgeScheduler";

/**
 * Which IAM a role ARN belongs to, and what the role is called there.
 */
export interface SimSchedulerExecutionRoleTarget {
  readonly accountId: SimAwsAccountId;
  readonly roleName: string;
  readonly roleArn: string;
}

/**
 * Read the Account and name out of a schedule's execution role ARN.
 *
 * The ARN was checked for being a role ARN when the schedule was written, so
 * this is reading a known shape rather than validating an unknown one.
 */
export function schedulerExecutionRoleTarget(
  roleArn: string,
): SimSchedulerExecutionRoleTarget {
  const parts = new IamRoleArnParser().parse(roleArn);

  return { accountId: parts.accountId, roleName: parts.roleName, roleArn };
}

/**
 * Assume a schedule's execution role, and answer with the caller it makes.
 *
 * This is the whole of what makes Scheduler's execution model different from an
 * EventBridge rule's. A rule reaches its target as the `events.amazonaws.com`
 * service principal and the target's own resource policy decides; a schedule
 * assumes a role, and the role's policies decide. So the two things checked
 * here are the two things that go wrong in a real account: whether the role
 * trusts Scheduler at all, and then, separately, whether it may do the thing.
 *
 * The caller carries both principals. The request is attributed to the session,
 * as it is on AWS, while the policies that apply are the role's, which is
 * exactly the split `SimResolvedCaller` exists for.
 */
export async function assumeSchedulerExecutionRole(
  target: SimSchedulerExecutionRoleTarget,
  iam: SimIam,
): Promise<SimAwsCaller> {
  const role = await roleOrRefuse(target, iam);

  try {
    new AssumeRoleTrustPolicyAuthorizer().authorize({
      roleArn: target.roleArn,
      role,
      targetIam: iam,
      caller: { kind: "service", service: simSchedulerServicePrincipal },
    });
  } catch (error) {
    if (error instanceof SimIamAccessDenied) {
      throw new SimSchedulerDeliveryNotPermitted(
        `The trust policy of ${target.roleArn} does not allow ` +
          `${simSchedulerServicePrincipal} to assume it, so the schedule ` +
          `could not invoke its target. Add it to the role's ` +
          `AssumeRolePolicyDocument.`,
      );
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
 * Load the execution role, refusing when it is not there.
 */
async function roleOrRefuse(
  target: SimSchedulerExecutionRoleTarget,
  iam: SimIam,
): Promise<Awaited<ReturnType<SimIam["getRole"]>>["Role"]> {
  try {
    const found = await iam.getRole({ input: { RoleName: target.roleName } });

    return found.Role;
  } catch {
    throw new SimSchedulerDeliveryNotPermitted(
      `${target.roleArn} is not a simulated IAM role, so the schedule could ` +
        `not assume it to invoke its target.`,
    );
  }
}
