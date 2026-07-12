import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { AssumeRoleCommand } from "@aws-sdk/client-sts";
import {
  assertIdentical,
  assertNonNullable,
  assertObjectHasProperty,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { makeSimAwsAccountId } from "../../aws/sim-aws-account.js";

describe("STS AssumeRole in the same sim Account", () => {
  it("allows the Account root to assume a Role that trusts the Account", async () => {
    // Given a Role that trusts root of its own sim Account.
    const accountId = makeSimAwsAccountId();
    const targetRoleArn = `arn:aws:iam::${accountId}:role/TargetRole`;
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simIam = simAws.iam();
    await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "TargetRole",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: {
              AWS: `arn:aws:iam::${accountId}:root`,
            },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );

    // When Account root assumes the Role through the STS facade.
    const assumeRoleOut = await simAws.sts().assumeRole(
      new AssumeRoleCommand({
        RoleArn: targetRoleArn,
        RoleSessionName: "root-session",
      }),
    );

    // Then STS returns credentials for the expected assumed-role identity.
    assertIdentical(
      assumeRoleOut.AssumedRoleUser?.Arn,
      `arn:aws:sts::${accountId}:assumed-role/TargetRole/root-session`,
    );
    assertNonNullable(assumeRoleOut.Credentials?.AccessKeyId);
    assertNonNullable(assumeRoleOut.Credentials.SessionToken);
  });

  it("allows a Role to assume another Role when identity and trust policies allow it", async () => {
    // Given a source Role allowed to assume a target Role that trusts it.
    const accountId = makeSimAwsAccountId();
    const targetRoleArn = `arn:aws:iam::${accountId}:role/TargetRole`;
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simIam = simAws.iam();
    const sourceRoleName = "SourceRole";
    const sourceRoleArn = `arn:aws:iam::${accountId}:role/${sourceRoleName}`;

    const sourceRole = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: sourceRoleName,
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: {
              AWS: `arn:aws:iam::${accountId}:root`,
            },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: sourceRoleName,
        PolicyName: "AssumeTargetRole",
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
    await simIam.createRole(
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

    // When the source Role assumes the target Role.
    const output = await simAws.sts().assumeRole(
      new AssumeRoleCommand({
        RoleArn: targetRoleArn,
        RoleSessionName: "role-session",
      }),
      {
        caller: { kind: "arn", arn: sourceRole.Role.Arn },
      },
    );

    // Then STS creates a session for the target Role.
    assertIdentical(
      output.AssumedRoleUser?.Arn,
      `arn:aws:sts::${accountId}:assumed-role/TargetRole/role-session`,
    );
    assertNonNullable(output.Credentials?.SecretAccessKey);
  });

  it("requires the ExternalId specified by the Role trust policy", async () => {
    // Given a target Role trust policy requiring a specific ExternalId.
    const accountId = makeSimAwsAccountId();
    const targetRoleArn = `arn:aws:iam::${accountId}:role/TargetRole`;
    const simAws = new SimAws({ defaultAccountId: accountId });
    await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "TargetRole",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: {
              AWS: `arn:aws:iam::${accountId}:root`,
            },
            Action: "sts:AssumeRole",
            Condition: {
              StringEquals: {
                "sts:ExternalId": "expected-external-id",
              },
            },
          },
        }),
      }),
    );

    // When Account root assumes the Role with the expected ExternalId.
    const assumeRoleOut = await simAws.sts().assumeRole(
      new AssumeRoleCommand({
        RoleArn: targetRoleArn,
        RoleSessionName: "external-id-session",
        ExternalId: "expected-external-id",
      }),
    );

    // Then the trust-policy condition permits the role session.
    assertIdentical(
      assumeRoleOut.AssumedRoleUser?.Arn,
      `arn:aws:sts::${accountId}:assumed-role/TargetRole/external-id-session`,
    );
  });

  it("registers issued credentials with IAM in the same Account", async () => {
    // Given an assumable Role in a sim Account.
    const accountId = makeSimAwsAccountId();
    const targetRoleArn = `arn:aws:iam::${accountId}:role/TargetRole`;
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simIam = simAws.iam();
    await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "TargetRole",
        AssumeRolePolicyDocument: JSON.stringify({
          Statement: {
            Effect: "Allow",
            Principal: {
              AWS: `arn:aws:iam::${accountId}:root`,
            },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );

    // When STS issues temporary credentials for the Role.
    const output = await simAws.sts().assumeRole(
      new AssumeRoleCommand({
        RoleArn: targetRoleArn,
        RoleSessionName: "resolvable-session",
      }),
    );
    const credentials = output.Credentials;
    assertNonNullable(credentials);
    assertNonNullable(credentials.AccessKeyId);
    assertNonNullable(credentials.SecretAccessKey);
    assertNonNullable(credentials.SessionToken);

    // Then the Account's top-level IAM facade resolves the issued identity.
    const identity = simIam.resolveCredentials({
      accessKeyId: credentials.AccessKeyId,
      secretAccessKey: credentials.SecretAccessKey,
      sessionToken: credentials.SessionToken,
    });
    assertObjectHasProperty(identity.principal, "arn");
    assertIdentical(
      identity.principal.arn,
      `arn:aws:sts::${accountId}:assumed-role/TargetRole/resolvable-session`,
    );
  });
});
