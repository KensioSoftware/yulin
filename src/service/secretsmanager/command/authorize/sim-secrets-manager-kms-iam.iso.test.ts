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
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

interface SimAwsWithSecret {
  readonly simAws: SimAws;
  readonly caller: SimAwsCaller;
}

/**
 * A simulated AWS holding one secret, and a Role allowed the given actions and
 * nothing else.
 *
 * The secret is created by the Account root, so what the Role is allowed only
 * decides whether it can read the secret afterwards.
 */
async function simAwsWithSecret(
  actions: readonly string[],
  keyed: "default-key" | "customer-key",
): Promise<SimAwsWithSecret> {
  const simAws = new SimAws();
  const accountId = simAws.defaultAccountId;

  const key = await simAws
    .kms()
    .createKey(new CreateKeyCommand({ Description: "Secret key" }));

  await simAws.secretsManager().createSecret(
    new CreateSecretCommand({
      Name: "db-credentials",
      SecretString: "hunter2",
      KmsKeyId: keyed === "customer-key" ? key.KeyMetadata?.Arn : undefined,
    }),
  );

  const role = await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "SecretReader",
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
      RoleName: "SecretReader",
      PolicyName: "SecretPolicy",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: { Effect: "Allow", Action: actions, Resource: "*" },
      }),
    }),
  );

  return { simAws, caller: { kind: "arn", arn: role.Role.Arn } };
}

describe("Secrets Manager KMS authorization", () => {
  it("reads a secret under the default key with no KMS permission", async () => {
    // Given a secret under the aws/secretsmanager key and a Role allowed only
    // to read it.
    const { simAws, caller } = await simAwsWithSecret(
      ["secretsmanager:GetSecretValue"],
      "default-key",
    );

    // When it reads the secret.
    const read = await simAws
      .secretsManager()
      .getSecretValue(
        new GetSecretValueCommand({ SecretId: "db-credentials" }),
        {
          caller,
        },
      );

    // Then it gets the value with no KMS grant of its own, because the managed
    // key's policy admits the Account's principals through Secrets Manager.
    assertIdentical(read.SecretString, "hunter2");
  });

  it("denies a read under a customer managed key with no kms:Decrypt", async () => {
    // Given the same Role, and a secret under a customer managed key.
    const { simAws, caller } = await simAwsWithSecret(
      ["secretsmanager:GetSecretValue"],
      "customer-key",
    );

    // When it reads the secret.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .secretsManager()
        .getSecretValue(
          new GetSecretValueCommand({ SecretId: "db-credentials" }),
          { caller },
        ),
    );

    // Then it is denied, which is the deployment failure worth reproducing:
    // the secret is allowed and the key is not.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "kms:Decrypt");
  });

  it("reads under a customer managed key once kms:Decrypt is granted", async () => {
    // Given a Role allowed both the secret and the key.
    const { simAws, caller } = await simAwsWithSecret(
      ["secretsmanager:GetSecretValue", "kms:Decrypt"],
      "customer-key",
    );

    // When it reads the secret.
    const read = await simAws
      .secretsManager()
      .getSecretValue(
        new GetSecretValueCommand({ SecretId: "db-credentials" }),
        {
          caller,
        },
      );

    // Then it gets the value.
    assertIdentical(read.SecretString, "hunter2");
  });

  it("denies a write under a customer managed key with no kms:GenerateDataKey", async () => {
    // Given a Role allowed to write the secret but nothing on its key.
    const { simAws, caller } = await simAwsWithSecret(
      ["secretsmanager:PutSecretValue"],
      "customer-key",
    );

    // When it writes a new version.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.secretsManager().putSecretValue(
        new PutSecretValueCommand({
          SecretId: "db-credentials",
          SecretString: "hunter3",
        }),
        { caller },
      ),
    );

    // Then it is denied. Secrets Manager encrypts each version with a data key
    // from KMS, so a write needs kms:GenerateDataKey rather than kms:Encrypt.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "kms:GenerateDataKey");
  });

  it("writes under a customer managed key once kms:GenerateDataKey is granted", async () => {
    // Given a Role allowed the secret and the data key.
    const { simAws, caller } = await simAwsWithSecret(
      ["secretsmanager:PutSecretValue", "kms:GenerateDataKey"],
      "customer-key",
    );

    // When it writes a new version.
    const written = await simAws.secretsManager().putSecretValue(
      new PutSecretValueCommand({
        SecretId: "db-credentials",
        SecretString: "hunter3",
      }),
      { caller },
    );

    // Then the write succeeds.
    assertNonNullable(written.VersionId);
  });

  it("writes under the default key with no KMS permission", async () => {
    // Given a Role allowed only to write the secret, under the managed key.
    const { simAws, caller } = await simAwsWithSecret(
      ["secretsmanager:PutSecretValue"],
      "default-key",
    );

    // When it writes a new version.
    const written = await simAws.secretsManager().putSecretValue(
      new PutSecretValueCommand({
        SecretId: "db-credentials",
        SecretString: "hunter3",
      }),
      { caller },
    );

    // Then the write succeeds, for the same reason the read does.
    assertNonNullable(written.VersionId);
  });
});
