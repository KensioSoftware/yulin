import {
  CreateKeyCommand,
  DecryptCommand,
  DescribeKeyCommand,
  EncryptCommand,
} from "@aws-sdk/client-kms";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { makeSimAwsAccountId } from "../../aws/sim-aws-account.js";
import {
  SimKmsInvalidCiphertextException,
  SimKmsNotFoundException,
} from "../error/sim-kms.error.js";

const plaintext = Uint8Array.from(Buffer.from("hunter2", "utf8"));

describe("KMS ciphertext blobs", () => {
  it("rejects a blob truncated part way through its header", async () => {
    // Given a real ciphertext.
    const simAws = new SimAws();
    const created = await simAws.kms().createKey(new CreateKeyCommand({}));
    const encrypted = await simAws.kms().encrypt(
      new EncryptCommand({
        KeyId: created.KeyMetadata?.Arn,
        Plaintext: plaintext,
      }),
    );
    assertNonNullable(encrypted.CiphertextBlob);

    // When it is cut short, leaving the marker intact but nothing after it.
    const truncated = encrypted.CiphertextBlob.slice(0, 12);

    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().decrypt(new DecryptCommand({ CiphertextBlob: truncated })),
    );

    // Then it is an invalid ciphertext rather than a crash reading past the end.
    assertInstanceOf(error, SimKmsInvalidCiphertextException);
  });

  it("rejects a blob naming a key this scope does not have", async () => {
    // Given a ciphertext produced in one Region.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    const created = await simAws
      .region("eu-west-2")
      .kms()
      .createKey(new CreateKeyCommand({}));
    const encrypted = await simAws
      .region("eu-west-2")
      .kms()
      .encrypt(
        new EncryptCommand({
          KeyId: created.KeyMetadata?.Arn,
          Plaintext: plaintext,
        }),
      );

    // When another Region is asked to decrypt it.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .region("us-east-1")
        .kms()
        .decrypt(
          new DecryptCommand({ CiphertextBlob: encrypted.CiphertextBlob }),
        ),
    );

    // Then it is an invalid ciphertext, not a missing key: the caller never
    // named a key, so there is none to report missing.
    assertInstanceOf(error, SimKmsInvalidCiphertextException);
  });
});

describe("KMS Account scope", () => {
  it("reaches KMS through an Account scope", async () => {
    // Given a simulation with a second Account.
    const otherAccountId = makeSimAwsAccountId();
    const simAws = new SimAws();

    // When that Account's KMS creates a key.
    const created = await simAws
      .account(otherAccountId)
      .kms()
      .createKey(new CreateKeyCommand({}));

    // Then the key belongs to that Account, and the default one cannot see it.
    assertIdentical(created.KeyMetadata?.AWSAccountId, otherAccountId);

    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .kms()
        .describeKey(
          new DescribeKeyCommand({ KeyId: created.KeyMetadata?.Arn }),
        ),
    );
    assertInstanceOf(error, SimKmsNotFoundException);
  });

  it("does not invent a key for an unknown non-AWS alias", async () => {
    // Given a simulation with no aliases.
    const simAws = new SimAws();

    // When an ordinary alias nothing created is named.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .kms()
        .describeKey(new DescribeKeyCommand({ KeyId: "alias/not-created" })),
    );

    // Then it is missing: only the reserved aws/ namespace appears on demand.
    assertInstanceOf(error, SimKmsNotFoundException);
  });
});
