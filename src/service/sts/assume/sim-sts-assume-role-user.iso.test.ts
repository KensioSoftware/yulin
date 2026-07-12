import { CreateRoleCommand, CreateUserCommand } from "@aws-sdk/client-iam";
import { AssumeRoleCommand } from "@aws-sdk/client-sts";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertObjectMatches,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { makeSimAwsAccountId } from "../../aws/sim-aws-account.js";
import { SimAws } from "../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../iam/error/sim-iam.error.js";

describe("STS AssumeRole for sim IAM Users", () => {
  it("allows a trusted IAM User to assume a Role", async () => {
    // Given an IAM User and a Role that directly trusts the User.
    const accountId = makeSimAwsAccountId();
    const targetRoleArn = `arn:aws:iam::${accountId}:role/UserTargetRole`;
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simIam = simAws.iam();
    const createUserOutput = await simIam.createUser(
      new CreateUserCommand({
        UserName: "TrustedUser",
      }),
    );
    const userArn = createUserOutput.User.Arn;
    assertNonNullable(userArn);
    await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "UserTargetRole",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: {
              AWS: userArn,
            },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );

    // When the User assumes the Role through the STS facade.
    const output = await simAws.sts().assumeRole(
      new AssumeRoleCommand({
        RoleArn: targetRoleArn,
        RoleSessionName: "user-session",
      }),
      {
        caller: {
          kind: "arn",
          arn: userArn,
        },
      },
    );

    // Then STS creates credentials for the expected Role session.
    assertIdentical(
      output.AssumedRoleUser?.Arn,
      `arn:aws:sts::${accountId}:assumed-role/UserTargetRole/user-session`,
    );

    const credentials = output.Credentials;
    assertNonNullable(credentials);
    assertNonNullable(credentials.AccessKeyId);
    assertNonNullable(credentials.SecretAccessKey);
    assertNonNullable(credentials.SessionToken);

    // And IAM resolves those credentials to the assumed Role.
    const identity = simIam.resolveCredentials({
      accessKeyId: credentials.AccessKeyId,
      secretAccessKey: credentials.SecretAccessKey,
      sessionToken: credentials.SessionToken,
    });
    assertObjectMatches(identity, {
      identityPolicyPrincipal: {
        kind: "arn",
        arn: targetRoleArn,
      },
    });
  });

  it("supplies the IAM User ARN to Role trust-policy conditions", async () => {
    // Given a Role that trusts Users matching a principal ARN condition.
    const accountId = makeSimAwsAccountId();
    const targetRoleArn = `arn:aws:iam::${accountId}:role/ConditionalUserRole`;
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simIam = simAws.iam();
    const createUserOutput = await simIam.createUser(
      new CreateUserCommand({
        UserName: "ApplicationUser",
        Path: "/application/",
      }),
    );
    const userArn = createUserOutput.User.Arn;
    assertNonNullable(userArn);
    await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ConditionalUserRole",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: "*",
            Action: "sts:AssumeRole",
            Condition: {
              StringLike: {
                "aws:PrincipalArn": `arn:aws:iam::${accountId}:user/application/*`,
              },
            },
          },
        }),
      }),
    );

    // When the matching User assumes the Role.
    const output = await simAws.sts().assumeRole(
      new AssumeRoleCommand({
        RoleArn: targetRoleArn,
        RoleSessionName: "conditional-user-session",
      }),
      {
        caller: {
          kind: "arn",
          arn: userArn,
        },
      },
    );

    // Then the caller-derived principal ARN satisfies the trust condition.
    assertIdentical(
      output.AssumedRoleUser?.Arn,
      `arn:aws:sts::${accountId}:assumed-role/ConditionalUserRole/conditional-user-session`,
    );
  });

  it("denies an IAM User that the Role does not trust", async () => {
    // Given an IAM User and a Role that trusts a different User.
    const accountId = makeSimAwsAccountId();
    const targetRoleArn = `arn:aws:iam::${accountId}:role/RestrictedUserRole`;
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simIam = simAws.iam();
    const createUserOutput = await simIam.createUser(
      new CreateUserCommand({
        UserName: "UntrustedUser",
      }),
    );
    const userArn = createUserOutput.User.Arn;
    assertNonNullable(userArn);
    await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "RestrictedUserRole",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: {
              AWS: `arn:aws:iam::${accountId}:user/TrustedUser`,
            },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );

    // When the untrusted User attempts to assume the Role.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.sts().assumeRole(
        new AssumeRoleCommand({
          RoleArn: targetRoleArn,
          RoleSessionName: "untrusted-user-session",
        }),
        {
          caller: {
            kind: "arn",
            arn: userArn,
          },
        },
      ),
    );

    // Then STS reports that the User cannot assume the Role.
    assertInstanceOf(error, SimIamAccessDenied);
    assertObjectMatches(error, {
      caller: {
        kind: "arn",
        arn: userArn,
      },
      action: "sts:AssumeRole",
      resource: targetRoleArn,
    });
  });
});
