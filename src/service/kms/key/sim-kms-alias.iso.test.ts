import {
  CreateAliasCommand,
  CreateKeyCommand,
  DescribeKeyCommand,
  EncryptCommand,
  ListAliasesCommand,
  ListKeysCommand,
  ScheduleKeyDeletionCommand,
} from "@aws-sdk/client-kms";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import {
  SimKmsAlreadyExistsException,
  SimKmsInvalidStateException,
  SimKmsValidationException,
} from "../error/sim-kms.error.js";

const plaintext = Uint8Array.from(Buffer.from("hunter2", "utf8"));

describe("KMS aliases", () => {
  it("refuses an alias name already in use", async () => {
    // Given an alias pointing at a key.
    const simAws = new SimAws();
    const created = await simAws.kms().createKey(new CreateKeyCommand({}));
    assertNonNullable(created.KeyMetadata);

    await simAws.kms().createAlias(
      new CreateAliasCommand({
        AliasName: "alias/app-key",
        TargetKeyId: created.KeyMetadata.KeyId,
      }),
    );

    // When the same name is created again.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().createAlias(
        new CreateAliasCommand({
          AliasName: "alias/app-key",
          TargetKeyId: created.KeyMetadata?.KeyId,
        }),
      ),
    );

    // Then KMS refuses it.
    assertInstanceOf(error, SimKmsAlreadyExistsException);
  });

  it("refuses an alias name without the alias prefix", async () => {
    // Given a key.
    const simAws = new SimAws();
    const created = await simAws.kms().createKey(new CreateKeyCommand({}));

    // When an alias is asked for without the required prefix.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().createAlias(
        new CreateAliasCommand({
          AliasName: "app-key",
          TargetKeyId: created.KeyMetadata?.KeyId,
        }),
      ),
    );

    // Then it is refused.
    assertInstanceOf(error, SimKmsValidationException);
  });

  it("refuses an alias reserved for AWS managed keys", async () => {
    // Given a key.
    const simAws = new SimAws();
    const created = await simAws.kms().createKey(new CreateKeyCommand({}));

    // When a reserved alias is asked for.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().createAlias(
        new CreateAliasCommand({
          AliasName: "alias/aws/s3",
          TargetKeyId: created.KeyMetadata?.KeyId,
        }),
      ),
    );

    // Then it is refused, as real KMS refuses the aws/ namespace.
    assertInstanceOf(error, SimKmsValidationException);
  });

  it("refuses a bare alias prefix with no name after it", async () => {
    // Given a key.
    const simAws = new SimAws();
    const created = await simAws.kms().createKey(new CreateKeyCommand({}));

    // When the prefix alone is asked for.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().createAlias(
        new CreateAliasCommand({
          AliasName: "alias/",
          TargetKeyId: created.KeyMetadata?.KeyId,
        }),
      ),
    );

    // Then it is refused: an alias has to name something.
    assertInstanceOf(error, SimKmsValidationException);
  });

  it("refuses an alias name beyond the KMS length limit", async () => {
    // Given a key.
    const simAws = new SimAws();
    const created = await simAws.kms().createKey(new CreateKeyCommand({}));

    // When a name longer than 256 characters is asked for.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().createAlias(
        new CreateAliasCommand({
          AliasName: `alias/${"a".repeat(256)}`,
          TargetKeyId: created.KeyMetadata?.KeyId,
        }),
      ),
    );

    // Then it is refused.
    assertInstanceOf(error, SimKmsValidationException);
  });

  it("refuses an alias name with characters KMS does not allow", async () => {
    // Given a key.
    const simAws = new SimAws();
    const created = await simAws.kms().createKey(new CreateKeyCommand({}));

    // When an alias containing a space is asked for.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().createAlias(
        new CreateAliasCommand({
          AliasName: "alias/app key",
          TargetKeyId: created.KeyMetadata?.KeyId,
        }),
      ),
    );

    // Then it is refused.
    assertInstanceOf(error, SimKmsValidationException);
  });

  it("lists the aliases of one key", async () => {
    // Given two keys, one of which has two aliases.
    const simAws = new SimAws();
    const first = await simAws.kms().createKey(new CreateKeyCommand({}));
    const second = await simAws.kms().createKey(new CreateKeyCommand({}));
    assertNonNullable(first.KeyMetadata);
    assertNonNullable(second.KeyMetadata);

    await Promise.all(
      ["alias/one", "alias/two"].map(async (aliasName) =>
        simAws.kms().createAlias(
          new CreateAliasCommand({
            AliasName: aliasName,
            TargetKeyId: first.KeyMetadata?.KeyId,
          }),
        ),
      ),
    );
    await simAws.kms().createAlias(
      new CreateAliasCommand({
        AliasName: "alias/other",
        TargetKeyId: second.KeyMetadata.KeyId,
      }),
    );

    // When one key's aliases are listed.
    const listed = await simAws
      .kms()
      .listAliases(new ListAliasesCommand({ KeyId: first.KeyMetadata.KeyId }));

    // Then only its own come back.
    assertArrayLength(listed.Aliases ?? [], 2);
  });

  it("truncates the alias listing at a requested limit", async () => {
    // Given a key with two aliases.
    const simAws = new SimAws();
    const created = await simAws.kms().createKey(new CreateKeyCommand({}));
    await Promise.all(
      ["alias/one", "alias/two"].map(async (aliasName) =>
        simAws.kms().createAlias(
          new CreateAliasCommand({
            AliasName: aliasName,
            TargetKeyId: created.KeyMetadata?.KeyId,
          }),
        ),
      ),
    );

    // When one alias is asked for.
    const listed = await simAws
      .kms()
      .listAliases(new ListAliasesCommand({ Limit: 1 }));

    // Then one comes back, marked truncated, as ListKeys does.
    assertArrayLength(listed.Aliases ?? [], 1);
    assertTrue(listed.Truncated ?? false);
  });

  it("lists every alias when no key is named", async () => {
    // Given a key with one alias.
    const simAws = new SimAws();
    const created = await simAws.kms().createKey(new CreateKeyCommand({}));
    assertNonNullable(created.KeyMetadata);

    await simAws.kms().createAlias(
      new CreateAliasCommand({
        AliasName: "alias/app-key",
        TargetKeyId: created.KeyMetadata.KeyId,
      }),
    );

    // When aliases are listed with no key.
    const listed = await simAws.kms().listAliases(new ListAliasesCommand({}));

    // Then the alias is reported with its ARN and target. The alias ARN names
    // the Account and Region, the same as a key ARN does.
    assertArrayLength(listed.Aliases ?? [], 1);

    const alias = listed.Aliases?.[0];
    assertNonNullable(alias);
    assertIdentical(alias.AliasName, "alias/app-key");
    assertIdentical(
      alias.AliasArn,
      `arn:aws:kms:${simAws.defaultRegionName}:${simAws.defaultAccountId}:alias/app-key`,
    );
    assertIdentical(alias.TargetKeyId, created.KeyMetadata.KeyId);
  });
});

describe("KMS AWS managed keys", () => {
  it("creates an AWS managed key on first reference to its alias", async () => {
    // Given a simulation where nothing has created a key.
    const simAws = new SimAws();

    // When a reserved AWS alias is used to encrypt.
    const encrypted = await simAws
      .kms()
      .encrypt(
        new EncryptCommand({ KeyId: "alias/aws/s3", Plaintext: plaintext }),
      );

    // Then the key exists, as an AWS managed one, the way it appears on real
    // AWS when a service first needs it.
    assertNonNullable(encrypted.KeyId);

    const described = await simAws
      .kms()
      .describeKey(new DescribeKeyCommand({ KeyId: "alias/aws/s3" }));
    assertNonNullable(described.KeyMetadata);
    assertIdentical(described.KeyMetadata.KeyManager, "AWS");
    assertIdentical(described.KeyMetadata.Arn, encrypted.KeyId);
  });

  it("reuses the same AWS managed key on later references", async () => {
    // Given an AWS managed key materialised by a first reference.
    const simAws = new SimAws();
    const first = await simAws
      .kms()
      .describeKey(new DescribeKeyCommand({ KeyId: "alias/aws/s3" }));

    // When the alias is used again.
    const second = await simAws
      .kms()
      .describeKey(new DescribeKeyCommand({ KeyId: "alias/aws/s3" }));

    // Then it is the same key, not a new one each time.
    assertIdentical(second.KeyMetadata?.Arn, first.KeyMetadata?.Arn);

    const keys = await simAws.kms().listKeys(new ListKeysCommand({}));
    assertArrayLength(keys.Keys ?? [], 1);
  });

  it("refuses to schedule deletion of an AWS managed key", async () => {
    // Given an AWS managed key materialised by referencing its alias.
    const simAws = new SimAws();
    await simAws
      .kms()
      .describeKey(new DescribeKeyCommand({ KeyId: "alias/aws/s3" }));

    // When deletion is scheduled for it.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .kms()
        .scheduleKeyDeletion(
          new ScheduleKeyDeletionCommand({ KeyId: "alias/aws/s3" }),
        ),
    );

    // Then it is refused: the owning service created it and only that service
    // can remove it.
    assertInstanceOf(error, SimKmsInvalidStateException);
  });
});
