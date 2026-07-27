import {
  CreateAliasCommand,
  CreateKeyCommand,
  DescribeKeyCommand,
  EncryptCommand,
  ListAliasesCommand,
  ListKeysCommand,
} from "@aws-sdk/client-kms";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertFalse,
  assertStringStartsWith,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { makeSimAwsAccountId } from "../../aws/sim-aws-account.js";
import {
  SimKmsAlreadyExistsException,
  SimKmsNotFoundException,
  SimKmsValidationException,
} from "../error/sim-kms.error.js";

const plaintext = Uint8Array.from(Buffer.from("hunter2", "utf8"));

describe("KMS KeyId resolution", () => {
  it("resolves a key by ID, ARN, alias name and alias ARN", async () => {
    // Given a key with an alias.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    const created = await simAws.kms().createKey(new CreateKeyCommand({}));
    assertNonNullable(created.KeyMetadata);
    const keyId = created.KeyMetadata.KeyId;
    const keyArn = created.KeyMetadata.Arn;

    await simAws.kms().createAlias(
      new CreateAliasCommand({
        AliasName: "alias/app-key",
        TargetKeyId: keyId,
      }),
    );

    const aliasArn = `arn:aws:kms:${simAws.defaultRegionName}:${accountId}:alias/app-key`;

    // When the key is named each of the four ways KMS accepts.
    const forms = [keyId, keyArn, "alias/app-key", aliasArn];

    // Then every one of them reaches the same key.
    const described = await Promise.all(
      forms.map(async (form) =>
        simAws.kms().describeKey(new DescribeKeyCommand({ KeyId: form })),
      ),
    );

    for (const output of described) {
      assertIdentical(output.KeyMetadata?.Arn, keyArn);
    }
  });

  it("builds a key ARN from its Account and Region", async () => {
    // Given a simulation with a known Account and Region.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    // When a key is created.
    const created = await simAws.kms().createKey(new CreateKeyCommand({}));

    // Then its ARN names both, as a real key ARN does.
    assertStringStartsWith(
      created.KeyMetadata?.Arn ?? "",
      `arn:aws:kms:${simAws.defaultRegionName}:${accountId}:key/`,
    );
  });

  it("does not resolve a key belonging to another Region", async () => {
    // Given a key in one Region.
    const simAws = new SimAws();
    const created = await simAws
      .region("eu-west-2")
      .kms()
      .createKey(new CreateKeyCommand({}));
    assertNonNullable(created.KeyMetadata);

    // When another Region's KMS is asked for it.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .region("us-east-1")
        .kms()
        .describeKey(
          new DescribeKeyCommand({ KeyId: created.KeyMetadata?.Arn }),
        ),
    );

    // Then it is not found: KMS keys are Region-scoped.
    assertInstanceOf(error, SimKmsNotFoundException);
  });

  it("refuses an unknown key", async () => {
    // Given a simulation with no keys.
    const simAws = new SimAws();

    // When an unknown key is named.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .kms()
        .describeKey(new DescribeKeyCommand({ KeyId: "no-such-key" })),
    );

    // Then KMS reports it missing.
    assertInstanceOf(error, SimKmsNotFoundException);
  });

  it("refuses a request with no KeyId", async () => {
    // Given a simulation with no keys.
    const simAws = new SimAws();

    // When no KeyId is supplied.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().describeKey({ input: {} }),
    );

    // Then the request is invalid rather than the key missing.
    assertInstanceOf(error, SimKmsValidationException);
  });
});

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

  it("lists every alias when no key is named", async () => {
    // Given a key with one alias.
    const simAws = new SimAws();
    const created = await simAws.kms().createKey(new CreateKeyCommand({}));
    await simAws.kms().createAlias(
      new CreateAliasCommand({
        AliasName: "alias/app-key",
        TargetKeyId: created.KeyMetadata?.KeyId,
      }),
    );

    // When aliases are listed with no key.
    const listed = await simAws.kms().listAliases(new ListAliasesCommand({}));

    // Then the alias is reported with its ARN and target.
    assertArrayLength(listed.Aliases ?? [], 1);
    assertIdentical(listed.Aliases?.[0]?.AliasName, "alias/app-key");
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
    assertIdentical(described.KeyMetadata?.KeyManager, "AWS");
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
});

describe("KMS ListKeys", () => {
  it("truncates the listing at a requested limit", async () => {
    // Given three keys.
    const simAws = new SimAws();
    await Promise.all(
      [1, 2, 3].map(async () =>
        simAws.kms().createKey(new CreateKeyCommand({})),
      ),
    );

    // When two are asked for.
    const listed = await simAws
      .kms()
      .listKeys(new ListKeysCommand({ Limit: 2 }));

    // Then two come back, marked truncated.
    assertArrayLength(listed.Keys ?? [], 2);
    assertTrue(listed.Truncated ?? false);
  });

  it("reports the whole listing as untruncated", async () => {
    // Given two keys.
    const simAws = new SimAws();
    await simAws.kms().createKey(new CreateKeyCommand({}));
    await simAws.kms().createKey(new CreateKeyCommand({}));

    // When they are listed with room to spare.
    const listed = await simAws
      .kms()
      .listKeys(new ListKeysCommand({ Limit: 5 }));

    // Then nothing is truncated.
    assertArrayLength(listed.Keys ?? [], 2);
    assertFalse(listed.Truncated ?? true);
  });
});
