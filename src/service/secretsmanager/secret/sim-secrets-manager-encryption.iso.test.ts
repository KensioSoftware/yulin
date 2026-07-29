import { CreateKeyCommand, DecryptCommand } from "@aws-sdk/client-kms";
import {
  CreateSecretCommand,
  GetSecretValueCommand,
  PutSecretValueCommand,
  UpdateSecretCommand,
} from "@aws-sdk/client-secrets-manager";
import {
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringNotIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimSecretsManagerSecret } from "./sim-secrets-manager-secret.js";
import type { SimSecretsManagerSecretVersion } from "./sim-secrets-manager-secret-version.js";
import {
  SimSecretsManagerDecryptionFailure,
  SimSecretsManagerEncryptionFailure,
} from "../error/sim-secrets-manager.error.js";

/**
 * The stored current version of a secret, reached through the simulator's own
 * accessor rather than the API, since the API only ever hands back plaintext.
 */
function storedCurrentVersion(
  simAws: SimAws,
  secretId: string,
): SimSecretsManagerSecretVersion {
  const version = storedSecret(simAws, secretId).versions.current;
  assertNonNullable(version);

  return version;
}

function storedSecret(
  simAws: SimAws,
  secretId: string,
): SimSecretsManagerSecret {
  const secret = simAws.secretsManager().findSecret(secretId);
  assertNonNullable(secret);

  return secret;
}

/**
 * The KMS key a version's data key came from, found by asking KMS to recover
 * that data key with the binding Secrets Manager made it under.
 */
async function dataKeyKeyId(
  simAws: SimAws,
  secretId: string,
): Promise<string | undefined> {
  const secret = storedSecret(simAws, secretId);
  const version = storedCurrentVersion(simAws, secretId);

  const dataKey = await simAws.kms().decrypt(
    new DecryptCommand({
      CiphertextBlob: version.value.dataKeyCiphertext,
      EncryptionContext: {
        SecretARN: secret.arn.value,
        SecretVersionId: version.versionId,
      },
    }),
    { viaService: "secretsmanager" },
  );

  return dataKey.KeyId;
}

describe("Secrets Manager value encryption", () => {
  it("stores a version encrypted rather than in the clear", async () => {
    // Given a secret naming no key of its own.
    const simAws = new SimAws();
    await simAws.secretsManager().createSecret(
      new CreateSecretCommand({
        Name: "db-credentials",
        SecretString: "hunter2",
      }),
    );

    // When the stored version is inspected.
    const version = storedCurrentVersion(simAws, "db-credentials");

    // Then the value is a ciphertext, and the key that made it is the AWS
    // managed key Secrets Manager creates on demand.
    assertStringNotIncludes(
      Buffer.from(version.value.ciphertext).toString("utf8"),
      "hunter2",
    );
    assertNonNullable(simAws.kms().findKey("alias/aws/secretsmanager"));
  });

  it("binds a version's data key to the secret and the version", async () => {
    // Given a secret with one version.
    const simAws = new SimAws();
    await simAws.secretsManager().createSecret(
      new CreateSecretCommand({
        Name: "bound-value",
        SecretString: "hunter2",
      }),
    );

    const secret = storedSecret(simAws, "bound-value");
    const version = storedCurrentVersion(simAws, "bound-value");

    // When KMS is asked for the data key under a different version's binding.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().decrypt(
        new DecryptCommand({
          CiphertextBlob: version.value.dataKeyCiphertext,
          EncryptionContext: {
            SecretARN: secret.arn.value,
            SecretVersionId: "some-other-version",
          },
        }),
        { viaService: "secretsmanager" },
      ),
    );

    // Then it refuses, because Secrets Manager binds both the secret ARN and
    // the version id as the encryption context, as real AWS does.
    assertInstanceOf(error, Error);
  });

  it("round-trips a binary value through encryption", async () => {
    // Given a secret holding bytes rather than text.
    const simAws = new SimAws();
    const bytes = Uint8Array.from([0, 1, 250, 255, 13, 10]);

    await simAws.secretsManager().createSecret(
      new CreateSecretCommand({
        Name: "certificate.p12",
        SecretBinary: bytes,
      }),
    );

    // When it is read back.
    const read = await simAws
      .secretsManager()
      .getSecretValue(
        new GetSecretValueCommand({ SecretId: "certificate.p12" }),
      );

    // Then the bytes come back unchanged and as binary, not as text.
    assertUndefined(read.SecretString);
    assertNonNullable(read.SecretBinary);
    assertArrayEquals([...read.SecretBinary], [...bytes]);
  });

  it("encrypts under a customer managed key when the secret names one", async () => {
    // Given a customer managed key.
    const simAws = new SimAws();
    const key = await simAws
      .kms()
      .createKey(new CreateKeyCommand({ Description: "Secret key" }));

    assertNonNullable(key.KeyMetadata?.Arn);

    // When a secret names it.
    await simAws.secretsManager().createSecret(
      new CreateSecretCommand({
        Name: "customer-keyed",
        SecretString: "hunter2",
        KmsKeyId: key.KeyMetadata.Arn,
      }),
    );

    // Then the version's data key came from that key, and the value still
    // reads back.
    assertIdentical(
      await dataKeyKeyId(simAws, "customer-keyed"),
      key.KeyMetadata.Arn,
    );

    const read = await simAws
      .secretsManager()
      .getSecretValue(
        new GetSecretValueCommand({ SecretId: "customer-keyed" }),
      );

    assertIdentical(read.SecretString, "hunter2");
  });

  it("leaves earlier versions readable when the key changes", async () => {
    // Given a secret written under the default key.
    const simAws = new SimAws();
    const key = await simAws
      .kms()
      .createKey(new CreateKeyCommand({ Description: "New secret key" }));

    await simAws
      .secretsManager()
      .createSecret(
        new CreateSecretCommand({ Name: "rekeyed", SecretString: "old" }),
      );

    // When the key and the value are changed together.
    await simAws.secretsManager().updateSecret(
      new UpdateSecretCommand({
        SecretId: "rekeyed",
        KmsKeyId: key.KeyMetadata?.Arn,
        SecretString: "new",
      }),
    );

    // Then the new version is under the new key and the old one is still
    // readable under the key it was written with, as on real AWS.
    assertIdentical(
      await dataKeyKeyId(simAws, "rekeyed"),
      key.KeyMetadata?.Arn,
    );

    const previous = await simAws.secretsManager().getSecretValue(
      new GetSecretValueCommand({
        SecretId: "rekeyed",
        VersionStage: "AWSPREVIOUS",
      }),
    );

    assertIdentical(previous.SecretString, "old");
  });

  it("refuses a KmsKeyId no key answers to", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a secret names a key that does not exist.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.secretsManager().createSecret(
        new CreateSecretCommand({
          Name: "no-such-key",
          SecretString: "hunter2",
          KmsKeyId: "alias/nothing-here",
        }),
      ),
    );

    // Then the write fails as an encryption failure, which is how real Secrets
    // Manager reports a key it cannot encrypt with.
    assertInstanceOf(error, SimSecretsManagerEncryptionFailure);

    // And no half-made secret is left holding the name.
    assertUndefined(simAws.secretsManager().findSecret("no-such-key"));
  });

  it("refuses a read of a version whose key is gone", async () => {
    // Given a secret under a customer managed key that is later disabled.
    const simAws = new SimAws();
    const key = await simAws
      .kms()
      .createKey(new CreateKeyCommand({ Description: "Doomed key" }));

    await simAws.secretsManager().createSecret(
      new CreateSecretCommand({
        Name: "unreadable",
        SecretString: "hunter2",
        KmsKeyId: key.KeyMetadata?.Arn,
      }),
    );

    await simAws.kms().disableKey({ input: { KeyId: key.KeyMetadata?.Arn } });

    // When the secret is read.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .secretsManager()
        .getSecretValue(new GetSecretValueCommand({ SecretId: "unreadable" })),
    );

    // Then it fails as a decryption failure rather than handing back a value
    // the key can no longer protect.
    assertInstanceOf(error, SimSecretsManagerDecryptionFailure);
  });

  it("keeps a repeated write with the same value a no-op", async () => {
    // Given a secret written with a client request token.
    const simAws = new SimAws();
    await simAws.secretsManager().createSecret(
      new CreateSecretCommand({
        Name: "retried-write",
        SecretString: "hunter2",
        ClientRequestToken: "the-token",
      }),
    );

    // When the same token is used again with the same value, and then with a
    // different one.
    const repeated = await simAws.secretsManager().putSecretValue(
      new PutSecretValueCommand({
        SecretId: "retried-write",
        SecretString: "hunter2",
        ClientRequestToken: "the-token",
      }),
    );

    const error = await assertThrowsErrorAsync(async () =>
      simAws.secretsManager().putSecretValue(
        new PutSecretValueCommand({
          SecretId: "retried-write",
          SecretString: "something else",
          ClientRequestToken: "the-token",
        }),
      ),
    );

    // Then the retry is accepted and the conflicting write is refused, which
    // still holds now that the stored version is a ciphertext.
    assertIdentical(repeated.VersionId, "the-token");
    assertInstanceOf(error, Error);
  });
});
