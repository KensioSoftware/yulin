import type { SimIamAccountResolver } from "../../iam/registry/sim-iam-account-resolver.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { AwsRegionName } from "../../aws/sim-aws-region.js";
import type { SimAwsResolvedCaller } from "../../aws/caller/sim-aws-caller-resolver.js";
import { simAwsCallerFor } from "../../aws/caller/sim-aws-resolved-caller.js";
import { SimIamAccessDenied } from "../../iam/error/sim-iam.error.js";

interface AssumeRoleSourceAccountAuthorizerProperties {
  readonly sourceAccountId: SimAwsAccountId;
  readonly iamResolver: SimIamAccountResolver;

  /**
   * The Region the STS request was made in.
   */
  readonly regionName: AwsRegionName;
}

export interface AssumeRoleSourceAuthorizationInput {
  readonly roleArn: string;

  /**
   * The caller as the request boundary resolved it.
   *
   * The identity policies deciding this are the ones held by the Role behind
   * an assumed-role session, so the resolved caller travels here whole.
   */
  readonly caller?: SimAwsResolvedCaller | undefined;

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
 * When no caller principal is supplied, sim IAM applies its own default caller
 * behaviour for the source Account.
 */
export class AssumeRoleSourcePrincipalAuthorizer {
  private readonly sourceAccountId: SimAwsAccountId;
  private readonly iamResolver: SimIamAccountResolver;
  private readonly regionName: AwsRegionName;

  constructor(properties: AssumeRoleSourceAccountAuthorizerProperties) {
    this.sourceAccountId = properties.sourceAccountId;
    this.iamResolver = properties.iamResolver;
    this.regionName = properties.regionName;
  }

  /**
   * Require the source Account to allow the caller to assume the target role.
   *
   * Throws when source IAM is unavailable or its policy decision denies the
   * request.
   */
  authorize(input: AssumeRoleSourceAuthorizationInput): void {
    const sourceIam = this.iamResolver.iamForAccount(this.sourceAccountId);

    // A request with no caller of its own is left for sim IAM to attribute.
    // The simulation's default caller reaches this decision the way it reaches
    // every other one.
    const decision = sourceIam.authorize({
      action: "sts:AssumeRole",
      resource: input.roleArn,
      region: this.regionName,
      caller:
        input.caller === undefined ? undefined : simAwsCallerFor(input.caller),
    });

    if (
      decision.isExplicitDeny ||
      (decision.isImplicitDeny && Boolean(input.identityPolicyAllowRequired))
    ) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        action: "sts:AssumeRole",
        resource: input.roleArn,
      });
    }
  }
}
