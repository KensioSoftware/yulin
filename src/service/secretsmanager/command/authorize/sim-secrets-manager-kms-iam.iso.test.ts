import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateKeyCommand } from "@aws-sdk/client-kms";
import {
  CreateSecretCommand,
  GetSecretValueCommand,
  PutSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";

describe("Secrets Manager KMS authorization", () => {
  it("reads a secret under the default key with no KMS permission", async () => {
    // Given a secret under the aws/secretsmanager key.
    const simAws = new SimAws();
    await simAws.secretsManager().createSecret(
      new CreateSecretCommand({
        Name: "db-credentials",
        SecretString: "hunter2",
      }),
    );

    // And a Role allowed only to read it.
    const role = await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "SecretReader",
        AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Principal: { AWS: `arn:aws:iam::${simAws.defaultAccountId}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "SecretReader",
        PolicyName: "SecretPolicy",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Action: "secretsmanager:GetSecretValue",
            Resource: "*",
          },
        }),
      }),
    );

    // When it reads the secret.
    const read = await simAws
      .secretsManager()
      .getSecretValue(
        new GetSecretValueCommand({ SecretId: "db-credentials" }),
        { caller: { kind: "arn", arn: role.Role.Arn } },
      );

    // Then it gets the value with no KMS grant of its own, because the managed
    // key's policy admits the Account's principals through Secrets Manager.
    assertIdentical(read.SecretString, "hunter2");
  });

  it("denies a read under a customer managed key with no kms:Decrypt", async () => {
    // Given a secret under a customer managed key.
    const simAws = new SimAws();
    const key = await simAws
      .kms()
      .createKey(new CreateKeyCommand({ Description: "Secret key" }));
    await simAws.secretsManager().createSecret(
      new CreateSecretCommand({
        Name: "db-credentials",
        SecretString: "hunter2",
        KmsKeyId: key.KeyMetadata?.Arn,
      }),
    );

    // And a Role allowed only to read the secret.
    const role = await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "SecretReader",
        AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Principal: { AWS: `arn:aws:iam::${simAws.defaultAccountId}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "SecretReader",
        PolicyName: "SecretPolicy",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Action: "secretsmanager:GetSecretValue",
            Resource: "*",
          },
        }),
      }),
    );

    // When it reads the secret.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .secretsManager()
        .getSecretValue(
          new GetSecretValueCommand({ SecretId: "db-credentials" }),
          { caller: { kind: "arn", arn: role.Role.Arn } },
        ),
    );

    // Then it is denied, which is the deployment failure worth reproducing:
    // the secret is allowed and the key is not.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "kms:Decrypt");
  });

  it("reads under a customer managed key once kms:Decrypt is granted", async () => {
    // Given a secret under a customer managed key.
    const simAws = new SimAws();
    const key = await simAws
      .kms()
      .createKey(new CreateKeyCommand({ Description: "Secret key" }));
    await simAws.secretsManager().createSecret(
      new CreateSecretCommand({
        Name: "db-credentials",
        SecretString: "hunter2",
        KmsKeyId: key.KeyMetadata?.Arn,
      }),
    );

    // And a Role allowed both the secret and the key.
    const role = await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "SecretReader",
        AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Principal: { AWS: `arn:aws:iam::${simAws.defaultAccountId}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "SecretReader",
        PolicyName: "SecretPolicy",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Action: ["secretsmanager:GetSecretValue", "kms:Decrypt"],
            Resource: "*",
          },
        }),
      }),
    );

    // When it reads the secret.
    const read = await simAws
      .secretsManager()
      .getSecretValue(
        new GetSecretValueCommand({ SecretId: "db-credentials" }),
        { caller: { kind: "arn", arn: role.Role.Arn } },
      );

    // Then it gets the value.
    assertIdentical(read.SecretString, "hunter2");
  });

  it("denies a write under a customer managed key with no kms:GenerateDataKey", async () => {
    // Given a secret under a customer managed key.
    const simAws = new SimAws();
    const key = await simAws
      .kms()
      .createKey(new CreateKeyCommand({ Description: "Secret key" }));
    await simAws.secretsManager().createSecret(
      new CreateSecretCommand({
        Name: "db-credentials",
        SecretString: "hunter2",
        KmsKeyId: key.KeyMetadata?.Arn,
      }),
    );

    // And a Role allowed to write the secret but nothing on its key.
    const role = await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "SecretReader",
        AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Principal: { AWS: `arn:aws:iam::${simAws.defaultAccountId}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "SecretReader",
        PolicyName: "SecretPolicy",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Action: "secretsmanager:PutSecretValue",
            Resource: "*",
          },
        }),
      }),
    );

    // When it writes a new version.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.secretsManager().putSecretValue(
        new PutSecretValueCommand({
          SecretId: "db-credentials",
          SecretString: "hunter3",
        }),
        { caller: { kind: "arn", arn: role.Role.Arn } },
      ),
    );

    // Then it is denied. Secrets Manager encrypts each version with a data key
    // from KMS, so a write needs kms:GenerateDataKey rather than kms:Encrypt.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "kms:GenerateDataKey");
  });

  it("writes under a customer managed key once kms:GenerateDataKey is granted", async () => {
    // Given a secret under a customer managed key.
    const simAws = new SimAws();
    const key = await simAws
      .kms()
      .createKey(new CreateKeyCommand({ Description: "Secret key" }));
    await simAws.secretsManager().createSecret(
      new CreateSecretCommand({
        Name: "db-credentials",
        SecretString: "hunter2",
        KmsKeyId: key.KeyMetadata?.Arn,
      }),
    );

    // And a Role allowed the secret and the data key.
    const role = await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "SecretReader",
        AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Principal: { AWS: `arn:aws:iam::${simAws.defaultAccountId}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "SecretReader",
        PolicyName: "SecretPolicy",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Action: ["secretsmanager:PutSecretValue", "kms:GenerateDataKey"],
            Resource: "*",
          },
        }),
      }),
    );

    // When it writes a new version.
    const written = await simAws.secretsManager().putSecretValue(
      new PutSecretValueCommand({
        SecretId: "db-credentials",
        SecretString: "hunter3",
      }),
      { caller: { kind: "arn", arn: role.Role.Arn } },
    );

    // Then the write succeeds.
    assertNonNullable(written.VersionId);
  });

  it("writes under the default key with no KMS permission", async () => {
    // Given a secret under the aws/secretsmanager key.
    const simAws = new SimAws();
    await simAws.secretsManager().createSecret(
      new CreateSecretCommand({
        Name: "db-credentials",
        SecretString: "hunter2",
      }),
    );

    // And a Role allowed only to write the secret.
    const role = await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "SecretReader",
        AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Principal: { AWS: `arn:aws:iam::${simAws.defaultAccountId}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "SecretReader",
        PolicyName: "SecretPolicy",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Action: "secretsmanager:PutSecretValue",
            Resource: "*",
          },
        }),
      }),
    );

    // When it writes a new version.
    const written = await simAws.secretsManager().putSecretValue(
      new PutSecretValueCommand({
        SecretId: "db-credentials",
        SecretString: "hunter3",
      }),
      { caller: { kind: "arn", arn: role.Role.Arn } },
    );

    // Then the write succeeds, for the same reason the read does.
    assertNonNullable(written.VersionId);
  });
});
