import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  CreateGroupCommand,
  CreateUserPoolCommand,
  ListGroupsCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertArrayEquals,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

const accountId = "111111111111";
const regionName = "eu-west-2";

interface SimCognitoWithRole {
  readonly simAws: SimAws;
  readonly caller: SimAwsCaller;
  readonly userPoolId: string;
}

function userPoolArn(userPoolId: string): string {
  return `arn:aws:cognito-idp:${regionName}:${accountId}:userpool/${userPoolId}`;
}

/**
 * A pool holding one user and one group, and a Role whose only permissions
 * are the statement given.
 */
async function simCognitoWithRole(
  policyStatement: object,
): Promise<SimCognitoWithRole> {
  const simAws = new SimAws({
    defaultAccountId: accountId,
    defaultRegionName: regionName,
  });
  const cognito = simAws.cognitoIdentityProvider();

  const created = await cognito.createUserPool(
    new CreateUserPoolCommand({ PoolName: "myapp-users" }),
  );

  assertNonNullable(created.UserPool?.Id);

  const userPoolId = created.UserPool.Id;

  await cognito.adminCreateUser(
    new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
  );
  await cognito.createGroup(
    new CreateGroupCommand({ UserPoolId: userPoolId, GroupName: "admins" }),
  );

  const role = await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "GroupReader",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: { AWS: `arn:aws:iam::${accountId}:root` },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );

  await simAws.iam().putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "GroupReader",
      PolicyName: "GroupPolicy",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: policyStatement,
      }),
    }),
  );

  return {
    simAws,
    caller: { kind: "arn", arn: role.Role.Arn },
    userPoolId,
  };
}

describe("sim Cognito group IAM authorization", () => {
  it("allows a group operation the caller's policy permits on the pool", async () => {
    // Given a Role allowed to list groups in one pool.
    const { simAws, caller, userPoolId } = await simCognitoWithRole({
      Effect: "Allow",
      Action: "cognito-idp:ListGroups",
      Resource: userPoolArn("*"),
    });

    // When that Role lists the pool's groups.
    const listed = await simAws
      .cognitoIdentityProvider()
      .listGroups(new ListGroupsCommand({ UserPoolId: userPoolId }), {
        caller,
      });

    // Then it is allowed, because a group is reached through its pool's ARN.
    assertArrayEquals(
      (listed.Groups ?? []).map((group) => group.GroupName),
      ["admins"],
    );
  });

  it("denies a group operation the caller's policy does not permit", async () => {
    // Given a Role allowed to read groups but not to change their membership.
    const { simAws, caller, userPoolId } = await simCognitoWithRole({
      Effect: "Allow",
      Action: ["cognito-idp:ListGroups", "cognito-idp:GetGroup"],
      Resource: userPoolArn("*"),
    });

    // When that Role puts a user in a group.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cognitoIdentityProvider().adminAddUserToGroup(
        new AdminAddUserToGroupCommand({
          UserPoolId: userPoolId,
          Username: "alice",
          GroupName: "admins",
        }),
        { caller },
      );
    });

    // Then it is denied: each operation authorizes its own IAM action.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("denies a group operation on a pool the policy does not name", async () => {
    // Given a Role allowed everything on a different pool.
    const { simAws, caller, userPoolId } = await simCognitoWithRole({
      Effect: "Allow",
      Action: "cognito-idp:*",
      Resource: userPoolArn("eu-west-2_zZzZzZzZz"),
    });

    // When that Role creates a group in this one.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cognitoIdentityProvider().createGroup(
        new CreateGroupCommand({
          UserPoolId: userPoolId,
          GroupName: "readers",
        }),
        { caller },
      );
    });

    // Then it is denied.
    assertInstanceOf(error, SimIamAccessDenied);
  });
});
