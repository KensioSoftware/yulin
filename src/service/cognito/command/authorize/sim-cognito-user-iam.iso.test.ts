import {
  AdminCreateUserCommand,
  AdminInitiateAuthCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  CreateUserPoolCommand,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

const accountId = "111111111111" as SimAwsAccountId;
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
 * A pool holding one user, and a Role whose only permissions are the statement
 * given.
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

  await cognito.adminCreateUser(
    new AdminCreateUserCommand({
      UserPoolId: created.UserPool.Id,
      Username: "alice",
    }),
  );

  const role = await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "UserReader",
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
      RoleName: "UserReader",
      PolicyName: "UserPolicy",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: policyStatement,
      }),
    }),
  );

  return {
    simAws,
    caller: { kind: "arn", arn: role.Role.Arn },
    userPoolId: created.UserPool.Id,
  };
}

describe("sim Cognito user IAM authorization", () => {
  it("denies an authentication the caller's policy does not permit", async () => {
    // Given a Role allowed to read users but not to sign them in.
    const { simAws, caller, userPoolId } = await simCognitoWithRole({
      Effect: "Allow",
      Action: "cognito-idp:AdminGetUser",
      Resource: userPoolArn("*"),
    });

    // When that Role starts an authentication.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cognitoIdentityProvider().adminInitiateAuth(
        new AdminInitiateAuthCommand({
          UserPoolId: userPoolId,
          ClientId: "aaaaaaaaaaaaaaaaaaaaaaaaaa",
          AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
          AuthParameters: { USERNAME: "alice", PASSWORD: "Sup3rSecret!" },
        }),
        { caller },
      );
    });

    // Then it is denied against the pool's ARN, before the app client or the
    // password is looked at.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("allows a user operation the caller's policy permits on the pool", async () => {
    // Given a Role allowed to read users in one pool.
    const { simAws, caller, userPoolId } = await simCognitoWithRole({
      Effect: "Allow",
      Action: ["cognito-idp:AdminGetUser", "cognito-idp:ListUsers"],
      Resource: userPoolArn("*"),
    });
    const cognito = simAws.cognitoIdentityProvider();

    // When that Role reads and lists the pool's users.
    const read = await cognito.adminGetUser(
      new AdminGetUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
      { caller },
    );
    const listed = await cognito.listUsers(
      new ListUsersCommand({ UserPoolId: userPoolId }),
      { caller },
    );

    // Then both are allowed, because a user is reached through its pool's ARN.
    assertIdentical(read.Username, "alice");
    assertIdentical(listed.Users?.length, 1);
  });

  it("denies a user operation the caller's policy does not permit", async () => {
    // Given a Role allowed to read users but not to change them.
    const { simAws, caller, userPoolId } = await simCognitoWithRole({
      Effect: "Allow",
      Action: "cognito-idp:AdminGetUser",
      Resource: userPoolArn("*"),
    });

    // When that Role sets a user's password.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cognitoIdentityProvider().adminSetUserPassword(
        new AdminSetUserPasswordCommand({
          UserPoolId: userPoolId,
          Username: "alice",
          Password: "Sup3rSecret!",
          Permanent: true,
        }),
        { caller },
      );
    });

    // Then it is denied: each operation authorizes its own IAM action.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("denies a user operation on a pool the policy does not name", async () => {
    // Given a Role allowed everything on a different pool.
    const { simAws, caller, userPoolId } = await simCognitoWithRole({
      Effect: "Allow",
      Action: "cognito-idp:*",
      Resource: userPoolArn("eu-west-2_zZzZzZzZz"),
    });

    // When that Role creates a user in this one.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cognitoIdentityProvider().adminCreateUser(
        new AdminCreateUserCommand({
          UserPoolId: userPoolId,
          Username: "bob",
        }),
        { caller },
      );
    });

    // Then it is denied.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("denies a caller with no permissions before saying whether a user exists", async () => {
    // Given a Role with no Cognito permissions at all.
    const { simAws, caller, userPoolId } = await simCognitoWithRole({
      Effect: "Allow",
      Action: "s3:GetObject",
      Resource: "*",
    });

    // When that Role reads a user that was never created.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cognitoIdentityProvider().adminGetUser(
        new AdminGetUserCommand({
          UserPoolId: userPoolId,
          Username: "nobody",
        }),
        { caller },
      );
    });

    // Then it is denied rather than reported missing, as real IAM evaluates
    // the request before the service handles it.
    assertInstanceOf(error, SimIamAccessDenied);
  });
});
