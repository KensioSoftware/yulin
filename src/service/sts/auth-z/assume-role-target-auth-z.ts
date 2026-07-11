import type { SimAwsPrincipal } from "../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { SimIamAccountResolver } from "../../iam/registry/sim-iam-account-resolver.js";
import type { IamRoleArnParts } from "../../iam/role/sim-iam-role-arn-parser.js";
import type { SimGetRoleCommandOutput } from "../../iam/command/role/get-role/get-role.cmd.js";
import type { SimIamConditionValue } from "../../iam/policy/sim-iam-policy.js";
import { AssumeRoleTargetResolver } from "./assume-role-target-resolver.js";
import { AssumeRoleTrustPolicyAuthorizer } from "./assume-role-trust-policy-authorizer.js";

interface AssumeRoleTargetRoleAuthorizerProps {
  readonly iamResolver: SimIamAccountResolver;
}

type AssumeRoleTargetRole = SimGetRoleCommandOutput["Role"];

interface AssumeRoleTargetAuthorizationInput {
  readonly roleArn: string;
  readonly target: IamRoleArnParts | SimAwsAccountId;
  readonly caller: SimAwsPrincipal;
  readonly conditionContext?:
    Readonly<Record<string, SimIamConditionValue>> | undefined;
}

/**
 * Resolves the target of an AssumeRole request and coordinates authorization.
 *
 * This class owns the account and Role lookup workflow. Target ARN parsing and
 * consistency checks belong to `AssumeRoleTargetResolver`, while trust-policy
 * parsing and evaluation belong to `AssumeRoleTrustPolicyAuthorizer`.
 *
 * Separating these steps prevents target lookup rules from becoming coupled to
 * IAM policy evaluation rules.
 */
export class AssumeRoleTargetRoleAuthorizer {
  private readonly iamResolver: SimIamAccountResolver;
  private readonly targetResolver = new AssumeRoleTargetResolver();
  private readonly trustPolicyAuthorizer =
    new AssumeRoleTrustPolicyAuthorizer();

  constructor(props: AssumeRoleTargetRoleAuthorizerProps) {
    this.iamResolver = props.iamResolver;
  }

  /**
   * Resolve the requested Role, load it from the target account, and require its
   * trust policy to allow the caller.
   *
   * Resolution happens before IAM lookup so the account and Role name used to load
   * the resource are guaranteed to agree with the ARN being authorized. The loaded
   * Role is returned for the session-creation stage after authorization succeeds.
   */
  async authorize(
    input: AssumeRoleTargetAuthorizationInput,
  ): Promise<AssumeRoleTargetRole> {
    const roleArnParts = this.targetResolver.resolve(
      input.roleArn,
      input.target,
    );
    const targetIam = this.iamResolver.iamForAccount(roleArnParts.accountId);
    const getRoleOutput = await targetIam.getRole({
      input: {
        RoleName: roleArnParts.roleName,
      },
    });
    const role = getRoleOutput.Role;

    this.trustPolicyAuthorizer.authorize({
      roleArn: input.roleArn,
      role,
      targetIam,
      caller: input.caller,
      conditionContext: input.conditionContext,
    });

    return role;
  }
}
