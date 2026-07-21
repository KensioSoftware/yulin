import { CreateRoleCommand } from "@aws-sdk/client-iam";
import { AssumeRoleCommand } from "@aws-sdk/client-sts";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertObjectMatches,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { makeSimAwsAccountId } from "../../aws/sim-aws-account.js";
import { SimAws } from "../../aws/sim-aws.js";
import { SimIamInvalidCredentials } from "../../iam/credential/error/sim-iam-credential.error.js";

describe("STS AssumeRole credentials and sessions", () => {
  it("creates credentials that IAM resolves to the Role session", async () => {
    // Given an IAM Role that its Account root can assume.
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

    // When STS creates credentials for an assumed Role session.
    const output = await simAws.sts().assumeRole(
      new AssumeRoleCommand({
        RoleArn: targetRoleArn,
        RoleSessionName: "credential-session",
      }),
    );
    const credentials = output.Credentials;
    assertNonNullable(credentials);
    assertNonNullable(credentials.AccessKeyId);
    assertNonNullable(credentials.SecretAccessKey);
    assertNonNullable(credentials.SessionToken);
    const identity = simIam.credentials.resolveCredentials({
      accessKeyId: credentials.AccessKeyId,
      secretAccessKey: credentials.SecretAccessKey,
      sessionToken: credentials.SessionToken,
    });

    // Then IAM resolves the credentials to that session and its underlying Role.
    assertObjectMatches(identity, {
      principal: {
        kind: "arn",
        arn: `arn:aws:sts::${accountId}:assumed-role/TargetRole/credential-session`,
      },
      identityPolicyPrincipal: {
        kind: "arn",
        arn: targetRoleArn,
      },
    });
    assertNonNullable(identity.session);
    assertIdentical(identity.session.sessionName, "credential-session");
  });

  it("rejects assumed Role credentials with a different secret access key", async () => {
    // Given valid temporary credentials issued for an assumed Role session.
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
    const output = await simAws.sts().assumeRole(
      new AssumeRoleCommand({
        RoleArn: targetRoleArn,
        RoleSessionName: "secret-validation-session",
      }),
    );
    const credentials = output.Credentials;
    assertNonNullable(credentials);
    const accessKeyId = credentials.AccessKeyId;
    assertNonNullable(accessKeyId);
    assertNonNullable(credentials.SessionToken);

    // When IAM validates the access key with a different secret access key.
    const error = assertThrowsError(() =>
      simIam.credentials.resolveCredentials({
        accessKeyId,
        secretAccessKey: "different-secret-access-key",
        sessionToken: credentials.SessionToken,
      }),
    );

    // Then IAM rejects the credentials for a secret access key mismatch.
    assertInstanceOf(error, SimIamInvalidCredentials);
    assertIdentical(error.reason, "secret-access-key-mismatch");
  });

  it("requires a session token for assumed Role credentials", async () => {
    // Given valid temporary credentials issued for an assumed Role session.
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
    const output = await simAws.sts().assumeRole(
      new AssumeRoleCommand({
        RoleArn: targetRoleArn,
        RoleSessionName: "token-validation-session",
      }),
    );
    const credentials = output.Credentials;
    assertNonNullable(credentials);
    const accessKeyId = credentials.AccessKeyId;
    assertNonNullable(accessKeyId);
    const secretAccessKey = credentials.SecretAccessKey;
    assertNonNullable(secretAccessKey);

    // When IAM validates the temporary access key without its session token.
    const error = assertThrowsError(() =>
      simIam.credentials.resolveCredentials({
        accessKeyId,
        secretAccessKey,
      }),
    );

    // Then IAM rejects the credentials because their session token is required.
    assertInstanceOf(error, SimIamInvalidCredentials);
    assertIdentical(error.reason, "session-token-missing");
  });

  it("rejects assumed Role credentials when their session expires", async () => {
    // Given temporary credentials issued with an explicit session duration.
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
    const output = await simAws.sts().assumeRole(
      new AssumeRoleCommand({
        RoleArn: targetRoleArn,
        RoleSessionName: "expiring-session",
        DurationSeconds: 900,
      }),
    );
    const credentials = output.Credentials;
    assertNonNullable(credentials);
    const accessKeyId = credentials.AccessKeyId;
    assertNonNullable(accessKeyId);
    const secretAccessKey = credentials.SecretAccessKey;
    assertNonNullable(secretAccessKey);
    assertNonNullable(credentials.SessionToken);
    assertNonNullable(credentials.Expiration);

    // When IAM validates the credentials at their expiration time.
    const error = assertThrowsError(() =>
      simIam.credentials.resolveCredentials(
        {
          accessKeyId,
          secretAccessKey,
          sessionToken: credentials.SessionToken,
        },
        credentials.Expiration,
      ),
    );

    // Then IAM rejects the credentials as an expired session.
    assertInstanceOf(error, SimIamInvalidCredentials);
    assertIdentical(error.reason, "expired-session");
    assertIdentical(
      error.expiration?.getTime(),
      credentials.Expiration.getTime(),
    );
  });
});
