import {
  CreateAliasCommand,
  CreateKeyCommand,
  DescribeKeyCommand,
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
  SimKmsNotFoundException,
  SimKmsValidationException,
} from "../error/sim-kms.error.js";

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

describe("KMS ARN scoping", () => {
  it("does not resolve a key ARN belonging to another Account", async () => {
    // Given a key, and the same key ID written into another Account's ARN.
    const accountId = makeSimAwsAccountId();
    const otherAccountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    const created = await simAws.kms().createKey(new CreateKeyCommand({}));
    assertNonNullable(created.KeyMetadata);

    const foreignArn = `arn:aws:kms:${simAws.defaultRegionName}:${otherAccountId}:key/${created.KeyMetadata.KeyId}`;

    // When the foreign ARN is used.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().describeKey(new DescribeKeyCommand({ KeyId: foreignArn })),
    );

    // Then it resolves to nothing, rather than having its key ID pulled out
    // and looked up in this Account.
    assertInstanceOf(error, SimKmsNotFoundException);
  });

  it("does not resolve a key ARN belonging to another Region", async () => {
    // Given a key, and the same key ID written into another Region's ARN.
    const simAws = new SimAws();
    const created = await simAws
      .region("eu-west-2")
      .kms()
      .createKey(new CreateKeyCommand({}));
    assertNonNullable(created.KeyMetadata);

    const foreignArn = `arn:aws:kms:us-east-1:${simAws.defaultAccountId}:key/${created.KeyMetadata.KeyId}`;

    // When the foreign ARN is used against the Region that owns the key.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .region("eu-west-2")
        .kms()
        .describeKey(new DescribeKeyCommand({ KeyId: foreignArn })),
    );

    // Then it is not found.
    assertInstanceOf(error, SimKmsNotFoundException);
  });

  it("does not resolve an ARN for another service", async () => {
    // Given a simulation with a key.
    const simAws = new SimAws({ defaultAccountId: makeSimAwsAccountId() });
    const created = await simAws.kms().createKey(new CreateKeyCommand({}));
    assertNonNullable(created.KeyMetadata);

    // When an ARN naming a different service is used.
    const otherServiceArn = `arn:aws:s3:${simAws.defaultRegionName}:${simAws.defaultAccountId}:key/${created.KeyMetadata.KeyId}`;

    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .kms()
        .describeKey(new DescribeKeyCommand({ KeyId: otherServiceArn })),
    );

    // Then it is not found.
    assertInstanceOf(error, SimKmsNotFoundException);
  });

  it("does not resolve an in-scope ARN naming neither a key nor an alias", async () => {
    // Given a simulation with a key.
    const simAws = new SimAws({ defaultAccountId: makeSimAwsAccountId() });
    await simAws.kms().createKey(new CreateKeyCommand({}));

    // When an ARN for this scope names some other kind of KMS resource.
    const grantArn = `arn:aws:kms:${simAws.defaultRegionName}:${simAws.defaultAccountId}:grant/abc`;

    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().describeKey(new DescribeKeyCommand({ KeyId: grantArn })),
    );

    // Then it is not found, rather than being read as a key identifier.
    assertInstanceOf(error, SimKmsNotFoundException);
  });
});
