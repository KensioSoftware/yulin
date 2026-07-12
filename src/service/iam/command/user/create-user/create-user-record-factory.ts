import type { SimArn } from "../../../../aws/arn.js";
import type { SimAwsAccountId } from "../../../../aws/sim-aws-account.js";
import type { SimIamUser, SimIamUsername } from "../../../user/sim-iam-user.js";
import { makeSimIamUserId } from "../../../user/sim-iam-user-id.js";
import type { SimCreateUserCommandOutput } from "./create-user.cmd.js";

interface MakeUserProps {
  readonly accountId: SimAwsAccountId;
  readonly arn: SimArn;
  readonly path: string;
  readonly userName: SimIamUsername;
}

/**
 * Creates simulated IAM user records and command outputs.
 */
export class CreateUserRecordFactory {
  /**
   * Make a sim IAM User from input props.
   */
  makeUser(props: MakeUserProps): SimIamUser {
    return {
      arn: props.arn,
      accountId: props.accountId,
      principalType: "user",
      name: props.userName,
      userId: makeSimIamUserId(),
      userName: props.userName,
      path: props.path,
      createDate: new Date(),
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
        CreateDate: user.createDate,
      },
    };
  }
}
