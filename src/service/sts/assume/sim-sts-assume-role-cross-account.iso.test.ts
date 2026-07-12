import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { AssumeRoleCommand } from "@aws-sdk/client-sts";
import {
  assertIdentical,
  assertNonNullable,
  assertObjectHasProperty,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { makeSimAwsAccountId } from "../../aws/sim-aws-account.js";
import { SimAws } from "../../aws/sim-aws.js";

describe("STS AssumeRole across sim Accounts", () => {
  it("allows a Role to assume a trusted Role in another Account", async () => {
    // Given a source Role allowed to assume a target Role that trusts it.
    const sourceAccountId = makeSimAwsAccountId();
    const targetAccountId = makeSimAwsAccountId();
    const sourceRoleName = "SourceRole";
    const sourceRoleArn = `arn:aws:iam::${sourceAccountId}:role/${sourceRoleName}`;
    const targetRoleArn = `arn:aws:iam::${targetAccountId}:role/TargetRole`;
    const simAws = new SimAws({ defaultAccountId: sourceAccountId });

    await simAws
      .account(sourceAccountId)
      .iam()
      .createRole(
        new CreateRoleCommand({
          RoleName: sourceRoleName,
          AssumeRolePolicyDocument: JSON.stringify({
            Version: "2012-10-17",
            Statement: {
              Effect: "Allow",
              Principal: {
                AWS: `arn:aws:iam::${sourceAccountId}:root`,
              },
              Action: "sts:AssumeRole",
            },
          }),
        }),
      );
    await simAws
      .account(sourceAccountId)
      .iam()
      .putRolePolicy(
        new PutRolePolicyCommand({
          RoleName: sourceRoleName,
          PolicyName: "AssumeCrossAccountRole",
          PolicyDocument: JSON.stringify({
            Version: "2012-10-17",
            Statement: {
              Effect: "Allow",
              Action: "sts:AssumeRole",
              Resource: targetRoleArn,
            },
          }),
        }),
      );
    await simAws
      .account(targetAccountId)
      .iam()
      .createRole(
        new CreateRoleCommand({
          RoleName: "TargetRole",
          AssumeRolePolicyDocument: JSON.stringify({
            Version: "2012-10-17",
            Statement: {
              Effect: "Allow",
              Principal: {
                AWS: sourceRoleArn,
              },
              Action: "sts:AssumeRole",
            },
          }),
        }),
      );

    // When the source Account's STS assumes the Role in the target Account.
    const output = await simAws
      .account(sourceAccountId)
      .sts()
      .assumeRole(
        new AssumeRoleCommand({
          RoleArn: targetRoleArn,
          RoleSessionName: "cross-account-session",
        }),
        {
          caller: { kind: "arn", arn: sourceRoleArn },
        },
      );

    // Then STS creates an assumed-role identity in the target Account.
    assertIdentical(
      output.AssumedRoleUser?.Arn,
      `arn:aws:sts::${targetAccountId}:assumed-role/TargetRole/cross-account-session`,
    );
    assertNonNullable(output.Credentials?.AccessKeyId);
  });

  it("registers cross-account credentials with IAM in the target Account", async () => {
    // Given cross-account Roles whose identity and trust policies allow AssumeRole.
    const sourceAccountId = makeSimAwsAccountId();
    const targetAccountId = makeSimAwsAccountId();
    const sourceRoleName = "SourceRole";
    const sourceRoleArn = `arn:aws:iam::${sourceAccountId}:role/${sourceRoleName}`;
    const targetRoleArn = `arn:aws:iam::${targetAccountId}:role/TargetRole`;
    const simAws = new SimAws({ defaultAccountId: sourceAccountId });

    await simAws
      .account(sourceAccountId)
      .iam()
      .createRole(
        new CreateRoleCommand({
          RoleName: sourceRoleName,
          AssumeRolePolicyDocument: JSON.stringify({
            Statement: {
              Effect: "Allow",
              Principal: {
                AWS: `arn:aws:iam::${sourceAccountId}:root`,
              },
              Action: "sts:AssumeRole",
            },
          }),
        }),
      );
    await simAws
      .account(sourceAccountId)
      .iam()
      .putRolePolicy(
        new PutRolePolicyCommand({
          RoleName: sourceRoleName,
          PolicyName: "AssumeCrossAccountRole",
          PolicyDocument: JSON.stringify({
            Statement: {
              Effect: "Allow",
              Action: "sts:AssumeRole",
              Resource: targetRoleArn,
            },
          }),
        }),
      );
    await simAws
      .account(targetAccountId)
      .iam()
      .createRole(
        new CreateRoleCommand({
          RoleName: "TargetRole",
          AssumeRolePolicyDocument: JSON.stringify({
            Statement: {
              Effect: "Allow",
              Principal: {
                AWS: sourceRoleArn,
              },
              Action: "sts:AssumeRole",
            },
          }),
        }),
      );

    // When STS issues credentials for the target Account's Role.
    const output = await simAws
      .account(sourceAccountId)
      .sts()
      .assumeRole(
        new AssumeRoleCommand({
          RoleArn: targetRoleArn,
          RoleSessionName: "target-iam-session",
        }),
        {
          caller: { kind: "arn", arn: sourceRoleArn },
        },
      );
    const credentials = output.Credentials;
    assertNonNullable(credentials);
    assertNonNullable(credentials.AccessKeyId);
    assertNonNullable(credentials.SecretAccessKey);
    assertNonNullable(credentials.SessionToken);

    // Then the target Account's IAM resolves the issued session identity.
    const identity = simAws.account(targetAccountId).iam().resolveCredentials({
      accessKeyId: credentials.AccessKeyId,
      secretAccessKey: credentials.SecretAccessKey,
      sessionToken: credentials.SessionToken,
    });
    assertObjectHasProperty(identity.principal, "arn");
    assertIdentical(
      identity.principal.arn,
      `arn:aws:sts::${targetAccountId}:assumed-role/TargetRole/target-iam-session`,
    );
  });

  it("allows a permitted Role when the target trusts its source Account", async () => {
    // Given a source Role permitted to assume a target Role that trusts its Account.
    const sourceAccountId = makeSimAwsAccountId();
    const targetAccountId = makeSimAwsAccountId();
    const sourceRoleName = "SourceRole";
    const sourceRoleArn = `arn:aws:iam::${sourceAccountId}:role/${sourceRoleName}`;
    const targetRoleArn = `arn:aws:iam::${targetAccountId}:role/TargetRole`;
    const simAws = new SimAws({ defaultAccountId: sourceAccountId });

    await simAws
      .account(sourceAccountId)
      .iam()
      .createRole(
        new CreateRoleCommand({
          RoleName: sourceRoleName,
          AssumeRolePolicyDocument: JSON.stringify({
            Statement: {
              Effect: "Allow",
              Principal: {
                AWS: `arn:aws:iam::${sourceAccountId}:root`,
              },
              Action: "sts:AssumeRole",
            },
          }),
        }),
      );
    await simAws
      .account(sourceAccountId)
      .iam()
      .putRolePolicy(
        new PutRolePolicyCommand({
          RoleName: sourceRoleName,
          PolicyName: "AssumeCrossAccountRole",
          PolicyDocument: JSON.stringify({
            Statement: {
              Effect: "Allow",
              Action: "sts:AssumeRole",
              Resource: targetRoleArn,
            },
          }),
        }),
      );
    await simAws
      .account(targetAccountId)
      .iam()
      .createRole(
        new CreateRoleCommand({
          RoleName: "TargetRole",
          AssumeRolePolicyDocument: JSON.stringify({
            Statement: {
              Effect: "Allow",
              Principal: {
                AWS: sourceAccountId,
              },
              Action: "sts:AssumeRole",
            },
          }),
        }),
      );

    // When the source Role assumes the Role through its Account's STS.
    const output = await simAws
      .account(sourceAccountId)
      .sts()
      .assumeRole(
        new AssumeRoleCommand({
          RoleArn: targetRoleArn,
          RoleSessionName: "account-trust-session",
        }),
        {
          caller: { kind: "arn", arn: sourceRoleArn },
        },
      );

    // Then the target Account's delegated trust permits the role session.
    assertIdentical(
      output.AssumedRoleUser?.Arn,
      `arn:aws:sts::${targetAccountId}:assumed-role/TargetRole/account-trust-session`,
    );
  });
});
