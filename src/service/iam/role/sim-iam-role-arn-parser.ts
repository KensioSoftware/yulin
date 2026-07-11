import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";

export interface IamRoleArnParts {
  readonly accountId: SimAwsAccountId;
  readonly roleName: string;
}

/**
 * Parses IAM role ARNs into the account ID and role name used by STS.
 */
export class IamRoleArnParser {
  /**
   * Parse an IAM role ARN.
   */
  parse(roleArn: string): IamRoleArnParts {
    const prefix = "arn:aws:iam::";
    const roleSeparator = ":role/";

    if (!roleArn.startsWith(prefix)) {
      throw new Error(`Invalid IAM Role ARN: ${roleArn}`);
    }

    const separatorIndex = roleArn.indexOf(roleSeparator, prefix.length);

    if (separatorIndex === -1) {
      throw new Error(`Invalid IAM Role ARN: ${roleArn}`);
    }

    const accountId = roleArn.slice(prefix.length, separatorIndex);
    const rolePathAndName = roleArn.slice(
      separatorIndex + roleSeparator.length,
    );
    const roleName = rolePathAndName.slice(
      rolePathAndName.lastIndexOf("/") + 1,
    );

    if (!this.isAccountId(accountId) || roleName.length === 0) {
      throw new Error(`Invalid IAM Role ARN: ${roleArn}`);
    }

    return {
      accountId: accountId as SimAwsAccountId,
      roleName,
    };
  }

  private isAccountId(value: string): boolean {
    if (value.length !== 12) {
      return false;
    }

    for (const character of value) {
      if (character < "0" || character > "9") {
        return false;
      }
    }

    return true;
  }
}
