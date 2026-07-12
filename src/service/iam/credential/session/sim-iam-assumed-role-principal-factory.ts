import type { SimArnPrincipal } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import type { SimIamRole } from "../../role/sim-iam-role.js";

/**
 * Creates the STS principal associated with an assumed IAM Role session.
 *
 * Assumed-role ARNs include the caller-supplied RoleSessionName as a path
 * component. Validating that value before interpolation prevents separators,
 * whitespace, and other unsupported characters from changing the ARN structure.
 *
 * AWS RoleSessionName values contain 2 through 64 characters. Supported
 * characters are ASCII letters, digits, underscores, and `+=,.@-`.
 */
export class SimIamAssumedRolePrincipalFactory {
  private static readonly validSessionName = /^[A-Za-z0-9_+=,.@-]{2,64}$/;

  constructor(private readonly accountId: SimAwsAccountId) {}

  /**
   * Validate the session name and construct its assumed-role principal.
   *
   * Keeping validation beside ARN construction ensures every principal produced
   * by this factory satisfies the constraints required for its final path
   * component.
   */
  make(role: SimIamRole, sessionName: string): SimArnPrincipal {
    this.validateSessionName(sessionName);

    return {
      kind: "arn",
      arn:
        `arn:aws:sts::${this.accountId}:assumed-role/` +
        `${role.roleName}/${sessionName}`,
    };
  }

  /**
   * Reject values that cannot be represented as an AWS RoleSessionName.
   *
   * Anchoring the expression requires the complete value to match. The length
   * quantifier also rejects empty, one-character, and overlong names without
   * maintaining separate validation branches.
   */
  private validateSessionName(sessionName: string): void {
    if (!SimIamAssumedRolePrincipalFactory.validSessionName.test(sessionName)) {
      /* v8 ignore next -- covered by regex validation in session manager */
      throw new Error(
        "Sim IAM Role session name must be 2-64 characters and contain only alphanumeric characters, underscores, or +=,.@-",
      );
    }
  }
}
