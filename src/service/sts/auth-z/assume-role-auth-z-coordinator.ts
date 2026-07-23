import type {
  SimArnPrincipal,
  SimAwsPrincipal,
} from "../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { SimGetRoleCommandOutput } from "../../iam/command/role/get-role/get-role.cmd.js";
import type { SimIamConditionValue } from "../../iam/policy/sim-iam-policy.js";
import type { SimIamAccountResolver } from "../../iam/registry/sim-iam-account-resolver.js";
import type { IamRoleArnParts } from "../../iam/role/arn/sim-iam-role-arn-parser.js";
import { AssumeRoleSourcePrincipalAuthorizer } from "./assume-role-src-acc-auth-z.js";
import { AssumeRoleTargetRoleAuthorizer } from "./assume-role-target-auth-z.js";

interface AssumeRoleAuthorizationCoordinatorProperties {
  readonly sourceAccountId: SimAwsAccountId;
  readonly iamResolver: SimIamAccountResolver;
}

interface AssumeRoleAuthorizationInput {
  readonly roleArn: string;
  readonly roleArnParts: IamRoleArnParts;
  readonly caller: SimArnPrincipal;
  readonly conditionContext?:
    Readonly<Record<string, SimIamConditionValue>> | undefined;
}

type AssumeRoleAuthorizedRole = SimGetRoleCommandOutput["Role"];

/**
 * Coordinates source identity authorization and target Role trust authorization
 * for an STS AssumeRole request.
 *
 * AssumeRole normally requires both an identity-policy Allow in the caller's
 * Account and a matching trust-policy Allow in the target Role's Account.
 * A directly trusted IAM User in the same Account is an exception: the Role
 * trust policy can grant that User access without a separate identity-policy
 * Allow. Matching explicit identity-policy Deny statements still reject the
 * request.
 *
 * The target trust policy is evaluated first because its matching grant must be
 * classified before the source authorization requirement can be selected.
 */
export class AssumeRoleAuthorizationCoordinator {
  private readonly sourceAccountId: SimAwsAccountId;
  private readonly sourcePrincipalAuthorizer: AssumeRoleSourcePrincipalAuthorizer;
  private readonly targetRoleAuthorizer: AssumeRoleTargetRoleAuthorizer;

  constructor(properties: AssumeRoleAuthorizationCoordinatorProperties) {
    this.sourceAccountId = properties.sourceAccountId;
    this.sourcePrincipalAuthorizer = new AssumeRoleSourcePrincipalAuthorizer({
      sourceAccountId: properties.sourceAccountId,
      iamResolver: properties.iamResolver,
    });
    this.targetRoleAuthorizer = new AssumeRoleTargetRoleAuthorizer({
      iamResolver: properties.iamResolver,
    });
  }

  /**
   * Require the applicable source identity and target trust permissions.
   *
   * The returned Role has passed target lookup and trust authorization and can
   * therefore be used to create the assumed-role session.
   */
  async authorize(
    input: AssumeRoleAuthorizationInput,
  ): Promise<AssumeRoleAuthorizedRole> {
    const targetAuthorization = await this.targetRoleAuthorizer.authorize({
      roleArn: input.roleArn,
      target: input.roleArnParts,
      caller: input.caller,
      conditionContext: input.conditionContext,
    });

    this.sourcePrincipalAuthorizer.authorize({
      roleArn: input.roleArn,
      callerPrincipal: input.caller,
      identityPolicyAllowRequired: !this.hasDirectSameAccountUserGrant(
        input.caller,
        input.roleArnParts.accountId,
        targetAuthorization.trust.isDirectPrincipalGrant,
      ),
    });

    return targetAuthorization.role;
  }

  /**
   * Whether the target trust policy is sufficient without an identity Allow.
   *
   * All three conditions are required:
   *
   * - the caller and target Role belong to the same Account;
   * - the caller is an IAM User rather than a Role, session, or root principal;
   * - a matching trust statement grants access directly rather than delegating
   *   authorization to the caller's Account.
   */
  private hasDirectSameAccountUserGrant(
    caller: SimAwsPrincipal,
    targetAccountId: SimAwsAccountId,
    isDirectPrincipalGrant: boolean,
  ): boolean {
    return (
      targetAccountId === this.sourceAccountId &&
      caller.kind === "arn" &&
      caller.arn.startsWith(`arn:aws:iam::${this.sourceAccountId}:user/`) &&
      isDirectPrincipalGrant
    );
  }
}
