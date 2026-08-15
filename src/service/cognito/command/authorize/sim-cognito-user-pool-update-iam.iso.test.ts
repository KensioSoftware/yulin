import {
  CreateUserPoolCommand,
  DescribeUserPoolCommand,
  GetUserPoolMfaConfigCommand,
  SetUserPoolMfaConfigCommand,
  UpdateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simIamRoleWithPolicyFactory } from "../../../iam/role/sim-iam-role-with-policy.factory.js";

const accountId = "111111111111";
const regionName = "eu-west-2";

function userPoolArn(userPoolId: string): string {
  return `arn:aws:cognito-idp:${regionName}:${accountId}:userpool/${userPoolId}`;
}

/**
 * A simulated AWS with a pool in it, and the pool's id.
 */
async function simAwsWithPool(): Promise<{
  readonly simAws: SimAws;
  readonly userPoolId: string;
}> {
  const simAws = new SimAws({
    defaultAccountId: accountId,
    defaultRegionName: regionName,
  });
  const created = await simAws
    .cognitoIdentityProvider()
    .createUserPool(new CreateUserPoolCommand({ PoolName: "myapp-users" }));
  const userPoolId = created.UserPool?.Id;

  assertTypeString(userPoolId);

  return { simAws, userPoolId };
}

describe("sim Cognito UpdateUserPool authorization", () => {
  it("allows an update to the pool the caller's policy names", async () => {
    // Given a Role allowed to update that pool alone, by its own ARN rather
    // than by a wildcard, so the ARN this simulation authorizes against has to
    // be the one a policy would really be written with.
    const { simAws, userPoolId } = await simAwsWithPool();
    const role = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "PoolAdministrator",
        actions: ["cognito-idp:UpdateUserPool", "cognito-idp:DescribeUserPool"],
        resource: userPoolArn(userPoolId),
      },
      simAws,
    );
    const caller = { caller: { kind: "arn", arn: role.Arn } } as const;

    // When that Role updates the pool.
    await simAws.cognitoIdentityProvider().updateUserPool(
      new UpdateUserPoolCommand({
        UserPoolId: userPoolId,
        DeletionProtection: "ACTIVE",
      }),
      caller,
    );

    // Then it is allowed, and the change is there.
    const described = await simAws
      .cognitoIdentityProvider()
      .describeUserPool(
        new DescribeUserPoolCommand({ UserPoolId: userPoolId }),
        caller,
      );

    assertIdentical(described.UserPool?.DeletionProtection, "ACTIVE");
  });

  it("denies an update to a pool the policy names another of", async () => {
    // Given a Role allowed everything on a different pool's ARN.
    const { simAws, userPoolId } = await simAwsWithPool();
    const role = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "OtherPoolAdministrator",
        actions: ["cognito-idp:*"],
        resource: userPoolArn("eu-west-2_zZzZzZzZz"),
      },
      simAws,
    );

    // When that Role updates this one.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cognitoIdentityProvider().updateUserPool(
        new UpdateUserPoolCommand({
          UserPoolId: userPoolId,
          DeletionProtection: "ACTIVE",
        }),
        { caller: { kind: "arn", arn: role.Arn } },
      );
    });

    // Then it is denied, because an update authorizes against the ARN of the
    // pool it names.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("denies an update to a pool the caller may only read", async () => {
    // Given a Role allowed to describe any pool and nothing else.
    const { simAws, userPoolId } = await simAwsWithPool();
    const role = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "PoolReader",
        actions: ["cognito-idp:DescribeUserPool"],
        resource: userPoolArn("*"),
      },
      simAws,
    );

    // When that Role updates the pool.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cognitoIdentityProvider().updateUserPool(
        new UpdateUserPoolCommand({
          UserPoolId: userPoolId,
          DeletionProtection: "ACTIVE",
        }),
        { caller: { kind: "arn", arn: role.Arn } },
      );
    });

    // Then it is denied, because UpdateUserPool is its own IAM action.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("authorizes setting and reading a pool's MFA against the pool's ARN", async () => {
    // Given a Role allowed to set and read the MFA of that pool alone. A stack
    // deploying a pool with MFA needs both actions, because CloudFormation
    // configures MFA in a call of its own after the pool exists.
    const { simAws, userPoolId } = await simAwsWithPool();
    const role = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "PoolMfaAdministrator",
        actions: [
          "cognito-idp:SetUserPoolMfaConfig",
          "cognito-idp:GetUserPoolMfaConfig",
        ],
        resource: userPoolArn(userPoolId),
      },
      simAws,
    );
    const caller = { caller: { kind: "arn", arn: role.Arn } } as const;
    const cognito = simAws.cognitoIdentityProvider();

    // When that Role configures the pool's MFA and reads it back.
    await cognito.setUserPoolMfaConfig(
      new SetUserPoolMfaConfigCommand({
        UserPoolId: userPoolId,
        MfaConfiguration: "OPTIONAL",
      }),
      caller,
    );
    const read = await cognito.getUserPoolMfaConfig(
      new GetUserPoolMfaConfigCommand({ UserPoolId: userPoolId }),
      caller,
    );

    // Then both are allowed.
    assertIdentical(read.MfaConfiguration, "OPTIONAL");
  });

  it("denies setting a pool's MFA to a caller that may only update it", async () => {
    // Given a Role allowed to update any pool and nothing else.
    const { simAws, userPoolId } = await simAwsWithPool();
    const role = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "PoolUpdater",
        actions: ["cognito-idp:UpdateUserPool"],
        resource: userPoolArn("*"),
      },
      simAws,
    );

    // When that Role configures the pool's MFA.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cognitoIdentityProvider().setUserPoolMfaConfig(
        new SetUserPoolMfaConfigCommand({
          UserPoolId: userPoolId,
          MfaConfiguration: "OPTIONAL",
        }),
        { caller: { kind: "arn", arn: role.Arn } },
      );
    });

    // Then it is denied, because SetUserPoolMfaConfig is its own IAM action.
    assertInstanceOf(error, SimIamAccessDenied);
  });
});
