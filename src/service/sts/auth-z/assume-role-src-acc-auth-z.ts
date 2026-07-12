import type { SimIamAccountResolver } from "../../iam/registry/sim-iam-account-resolver.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { SimAwsPrincipal } from "../../aws/caller/sim-aws-caller.js";
import { makeSimAwsAccountRootPrincipal } from "../../aws/caller/sim-aws-account-root-principal.js";
import { SimIamAccessDenied } from "../../iam/error/sim-iam.error.js";

interface AssumeRoleSourceAccountAuthorizerProps {
  readonly sourceAccountId: SimAwsAccountId;
  readonly iamResolver: SimIamAccountResolver;
}

export interface AssumeRoleSourceAuthorizationInput {
  readonly roleArn: string;
  readonly callerPrincipal?: SimAwsPrincipal | undefined;

  /**
   * Whether the caller must have an identity-policy Allow for sts:AssumeRole.
   *
   * This is false when a same-account Role trust policy grants permission
   * directly to an IAM User. Explicit identity-policy denies always apply.
   */
  readonly identityPolicyAllowRequired?: boolean | undefined;
}

/**
 * Authorizes the caller's request to assume a role against IAM in the source
 * Account.
 *
 * This class owns only the identity-side authorization performed by the
 * caller's Account. It resolves that Account's simulated IAM facade and
 * evaluates `sts:AssumeRole` against the target role ARN. Target-account role
 * trust authorization is a separate responsibility and must be performed even
 * when the source and target Account are the same.
 *
 * When no caller principal is supplied, Sim IAM applies its normal default
 * caller behavior for the source Account.
 */
export class AssumeRoleSourcePrincipalAuthorizer {
  private readonly sourceAccountId: SimAwsAccountId;
  private readonly iamResolver: SimIamAccountResolver;

  constructor(props: AssumeRoleSourceAccountAuthorizerProps) {
    this.sourceAccountId = props.sourceAccountId;
    this.iamResolver = props.iamResolver;
  }

  /**
   * Require the source Account to allow the caller to assume the target role.
   *
   * Throws when source IAM is unavailable or its policy decision denies the
   * request.
   */
  authorize(input: AssumeRoleSourceAuthorizationInput): void {
    const sourceIam = this.iamResolver.iamForAccount(this.sourceAccountId);
    const callerPrincipal =
      input.callerPrincipal ??
      makeSimAwsAccountRootPrincipal(this.sourceAccountId);

    const decision = sourceIam.authorize({
      action: "sts:AssumeRole",
      resource: input.roleArn,
      caller: callerPrincipal,
    });

    if (
      decision.isExplicitDeny ||
      (decision.isImplicitDeny && Boolean(input.identityPolicyAllowRequired))
    ) {
      throw new SimIamAccessDenied({
        caller: callerPrincipal,
        action: "sts:AssumeRole",
        resource: input.roleArn,
      });
    }
  }
}
