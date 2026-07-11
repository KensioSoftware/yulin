import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import {
  IamRoleArnParser,
  type IamRoleArnParts,
} from "../../iam/role/sim-iam-role-arn-parser.js";

/**
 * Resolves and validates the target identity used by an AssumeRole request.
 *
 * STS callers can identify the target in either of two forms:
 *
 * - an Account ID, with the Role name obtained from the Role ARN;
 * - parsed Role ARN parts containing both the Account ID and Role name.
 *
 * The Role ARN remains the canonical source because it is the resource that IAM
 * authorizes. The separately supplied target is checked against that ARN so STS
 * cannot resolve one Role while authorizing another resource.
 */
export class AssumeRoleTargetResolver {
  constructor(private readonly roleArnParser = new IamRoleArnParser()) {}

  /**
   * Parse the Role ARN and verify that it agrees with the supplied target.
   *
   * An Account ID target only constrains the account. This form is used when the
   * caller has not already parsed the Role name, so the returned name comes from
   * the ARN.
   *
   * A parsed target constrains both the account and Role name. Both values must
   * match before the target can be used for IAM lookup.
   */
  resolve(
    roleArn: string,
    target: IamRoleArnParts | SimAwsAccountId,
  ): IamRoleArnParts {
    const parsedRoleArn = this.roleArnParser.parse(roleArn);

    if (typeof target === "string") {
      this.requireMatchingAccount(roleArn, target, parsedRoleArn);
      return parsedRoleArn;
    }

    this.requireMatchingRole(roleArn, target, parsedRoleArn);
    return target;
  }

  /**
   * Require an Account ID target to identify the account encoded in the ARN.
   *
   * Returning the parsed ARN parts after this check supplies the Role name while
   * preserving the existing Account-ID-only input form.
   */
  private requireMatchingAccount(
    roleArn: string,
    targetAccountId: SimAwsAccountId,
    parsedRoleArn: IamRoleArnParts,
  ): void {
    if (parsedRoleArn.accountId !== targetAccountId) {
      throw new Error(
        `Target Account ${targetAccountId} does not match Role ARN ${roleArn}`,
      );
    }
  }

  /**
   * Require pre-parsed target parts to represent the same Role as the ARN.
   *
   * Comparing both fields prevents a target from selecting a different account
   * or a different Role in the same account.
   */
  private requireMatchingRole(
    roleArn: string,
    target: IamRoleArnParts,
    parsedRoleArn: IamRoleArnParts,
  ): void {
    if (
      parsedRoleArn.accountId !== target.accountId ||
      parsedRoleArn.roleName !== target.roleName
    ) {
      throw new Error(`Target Role ARN parts do not match Role ARN ${roleArn}`);
    }
  }
}
