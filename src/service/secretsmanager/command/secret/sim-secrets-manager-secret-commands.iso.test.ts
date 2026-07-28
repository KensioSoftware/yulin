import {
  CreateSecretCommand,
  DescribeSecretCommand,
  GetSecretValueCommand,
  PutSecretValueCommand,
  UpdateSecretCommand,
} from "@aws-sdk/client-secrets-manager";
import {
  assertArrayEquals,
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertObjectEquals,
  assertStringStartsWith,
  assertStringLength,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";

const accountIdOneOnes = "111111111111" as SimAwsAccountId;

describe("Secrets Manager CreateSecret", () => {
  it("gives the secret an ARN carrying six random characters", async () => {
    // Given a simulated AWS in a known Account and Region.
    const simAws = new SimAws({
      defaultAccountId: accountIdOneOnes,
      defaultRegionName: "eu-west-2",
    });

    // When a secret is created.
    const created = await simAws.secretsManager().createSecret(
      new CreateSecretCommand({
        Name: "db-creds",
        SecretString: JSON.stringify({ username: "app", password: "hunter2" }),
      }),
    );

    // Then the ARN ends in the name plus a hyphen and six characters, exactly
    // as real Secrets Manager builds it.
    assertNonNullable(created.ARN);
    assertStringStartsWith(
      created.ARN,
      "arn:aws:secretsmanager:eu-west-2:111111111111:secret:db-creds-",
    );
    const suffix = created.ARN.split("db-creds-", 2).at(1);
    assertNonNullable(suffix);
    assertStringLength(suffix, 6);
    assertIdentical(created.Name, "db-creds");
  });

  it("labels the first version AWSCURRENT", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a secret is created.
    const created = await simAws.secretsManager().createSecret(
      new CreateSecretCommand({
        Name: "api-key",
        SecretString: "hunter2",
      }),
    );

    // Then its only version is the current one.
    assertNonNullable(created.VersionId);
    const described = await simAws
      .secretsManager()
      .describeSecret(new DescribeSecretCommand({ SecretId: "api-key" }));

    assertObjectEquals(described.VersionIdsToStages, {
      [created.VersionId]: ["AWSCURRENT"],
    });
  });

  it("stores a binary secret and hands it back as binary", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();
    const bytes = Uint8Array.from([1, 2, 3, 4]);

    // When a secret is created with binary rather than text.
    await simAws.secretsManager().createSecret(
      new CreateSecretCommand({
        Name: "certificate.p12",
        SecretBinary: bytes,
      }),
    );

    // Then reading it back gives the bytes and no string.
    const read = await simAws
      .secretsManager()
      .getSecretValue(
        new GetSecretValueCommand({ SecretId: "certificate.p12" }),
      );

    assertUndefined(read.SecretString);
    assertNonNullable(read.SecretBinary);
    assertArrayEquals([...read.SecretBinary], [1, 2, 3, 4]);
  });

  it("uses a client request token as the version id", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a secret is created with a request token of the caller's choosing.
    const created = await simAws.secretsManager().createSecret(
      new CreateSecretCommand({
        Name: "tokened",
        SecretString: "hunter2",
        ClientRequestToken: "my-own-token",
      }),
    );

    // Then that token is the version id, as it is on real AWS.
    assertIdentical(created.VersionId, "my-own-token");
  });
});

describe("Secrets Manager DescribeSecret", () => {
  it("reports the metadata a secret was created with", async () => {
    // Given a secret created with a description, a KMS key and tags.
    const simAws = new SimAws();
    await simAws.secretsManager().createSecret(
      new CreateSecretCommand({
        Name: "described",
        SecretString: "hunter2",
        Description: "Application database credentials",
        KmsKeyId: "alias/app-key",
        Tags: [{ Key: "team", Value: "platform" }],
      }),
    );

    // When it is described.
    const described = await simAws
      .secretsManager()
      .describeSecret(new DescribeSecretCommand({ SecretId: "described" }));

    // Then the metadata comes back, and rotation is reported as disabled
    // because rotation is not simulated.
    assertIdentical(described.Description, "Application database credentials");
    assertIdentical(described.KmsKeyId, "alias/app-key");
    assertNonNullable(described.Tags);
    assertArrayLength(described.Tags, 1);
    const tag = described.Tags.at(0);
    assertNonNullable(tag);
    assertIdentical(tag.Key, "team");
    assertIdentical(tag.Value, "platform");
    assertFalse(described.RotationEnabled);
    assertUndefined(described.DeletedDate);
    assertNonNullable(described.CreatedDate);
    assertNonNullable(described.LastChangedDate);
  });
});

describe("Secrets Manager UpdateSecret", () => {
  it("writes a new current version when given a value", async () => {
    // Given a secret with one version.
    const simAws = new SimAws();
    const created = await simAws.secretsManager().createSecret(
      new CreateSecretCommand({
        Name: "rotated-by-hand",
        SecretString: "old",
      }),
    );

    // When it is updated with a new value.
    const updated = await simAws.secretsManager().updateSecret(
      new UpdateSecretCommand({
        SecretId: "rotated-by-hand",
        SecretString: "new",
      }),
    );

    // Then the new version is current and the old one is previous.
    assertNonNullable(updated.VersionId);
    const read = await simAws
      .secretsManager()
      .getSecretValue(
        new GetSecretValueCommand({ SecretId: "rotated-by-hand" }),
      );

    assertIdentical(read.SecretString, "new");
    assertIdentical(read.VersionId, updated.VersionId);

    const previous = await simAws.secretsManager().getSecretValue(
      new GetSecretValueCommand({
        SecretId: "rotated-by-hand",
        VersionStage: "AWSPREVIOUS",
      }),
    );

    assertIdentical(previous.SecretString, "old");
    assertIdentical(previous.VersionId, created.VersionId);
  });

  it("changes metadata without writing a version", async () => {
    // Given a secret with one version.
    const simAws = new SimAws();
    const created = await simAws.secretsManager().createSecret(
      new CreateSecretCommand({
        Name: "metadata-only",
        SecretString: "hunter2",
      }),
    );

    // When only its description is updated.
    const updated = await simAws.secretsManager().updateSecret(
      new UpdateSecretCommand({
        SecretId: "metadata-only",
        Description: "Now with an explanation",
        KmsKeyId: "alias/other-key",
      }),
    );

    // Then no version was written and the metadata changed.
    assertUndefined(updated.VersionId);

    const described = await simAws
      .secretsManager()
      .describeSecret(new DescribeSecretCommand({ SecretId: "metadata-only" }));

    assertIdentical(described.Description, "Now with an explanation");
    assertIdentical(described.KmsKeyId, "alias/other-key");
    assertNonNullable(created.VersionId);
    assertObjectEquals(described.VersionIdsToStages, {
      [created.VersionId]: ["AWSCURRENT"],
    });
  });

  it("leaves metadata alone when the version write fails", async () => {
    // Given a secret with a version written under a request token.
    const simAws = new SimAws();
    await simAws.secretsManager().createSecret(
      new CreateSecretCommand({
        Name: "all-or-nothing",
        SecretString: "first",
        Description: "As it was",
      }),
    );
    await simAws.secretsManager().putSecretValue(
      new PutSecretValueCommand({
        SecretId: "all-or-nothing",
        SecretString: "second",
        ClientRequestToken: "reused",
      }),
    );

    // When an update reuses that token for a different value, alongside a
    // metadata change.
    await assertThrowsErrorAsync(async () =>
      simAws.secretsManager().updateSecret(
        new UpdateSecretCommand({
          SecretId: "all-or-nothing",
          SecretString: "different",
          Description: "Should not stick",
          ClientRequestToken: "reused",
        }),
      ),
    );

    // Then the metadata change did not stick either: a failed request leaves
    // the secret as it was.
    const described = await simAws
      .secretsManager()
      .describeSecret(
        new DescribeSecretCommand({ SecretId: "all-or-nothing" }),
      );

    assertIdentical(described.Description, "As it was");
  });
});
