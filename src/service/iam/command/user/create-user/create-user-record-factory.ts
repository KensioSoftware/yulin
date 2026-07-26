import type { SimArn } from "../../../../aws/arn.js";
import type { SimAwsAccountId } from "../../../../aws/sim-aws-account.js";
import type { SimIamUser, SimIamUsername } from "../../../user/sim-iam-user.js";
import { makeSimIamUserId } from "../../../user/sim-iam-user-id.js";
import type { SimCreateUserCommandOutput } from "./create-user.command.js";

interface MakeUserProperties {
  readonly accountId: SimAwsAccountId;
  readonly arn: SimArn;
  readonly path: string;
  readonly userName: SimIamUsername;
  readonly creationDate: Date;
}

/**
 * Creates simulated IAM user records and command outputs.
 */
export class CreateUserRecordFactory {
  /**
   * Make a sim IAM User from input props.
   */
  makeUser(properties: MakeUserProperties): SimIamUser {
    return {
      arn: properties.arn,
      accountId: properties.accountId,
      principalType: "user",
      name: properties.userName,
      userId: makeSimIamUserId(),
      userName: properties.userName,
      path: properties.path,
      creationDate: properties.creationDate,
      accessKeys: new Map(),
      inlinePolicies: new Map(),
      attachedPolicyArns: new Set(),
    };
  }

  /**
   * Make a sim Create User command output from a sim IAM User.
   */
  makeOutput(user: SimIamUser): SimCreateUserCommandOutput {
    return {
      User: {
        Path: user.path,
        UserName: user.userName,
        UserId: user.userId,
        Arn: user.arn,
        CreateDate: user.creationDate,
      },
    };
  }
}
