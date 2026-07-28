import {
  CreateKeyCommand,
  DecryptCommand,
  EncryptCommand,
  GenerateDataKeyCommand,
} from "@aws-sdk/client-kms";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimKmsInvalidKeyUsageException,
  SimKmsValidationException,
} from "../../error/sim-kms.error.js";

const plaintext = Uint8Array.from(Buffer.from("hunter2", "utf8"));

describe("KMS CreateKey validation", () => {
  it("refuses an asymmetric key spec", async () => {
    // Given a simulation that models only symmetric keys.
    const simAws = new SimAws();

    // When an asymmetric key is asked for.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().createKey(new CreateKeyCommand({ KeySpec: "RSA_2048" })),
    );

    // Then it is refused rather than quietly made symmetric, so a test cannot
    // pass against a key type this simulation does not model.
    assertInstanceOf(error, SimKmsInvalidKeyUsageException);
  });

  it("refuses a key usage other than encrypt and decrypt", async () => {
    // Given a simulation that models only encryption keys.
    const simAws = new SimAws();

    // When a signing key is asked for.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().createKey(new CreateKeyCommand({ KeyUsage: "SIGN_VERIFY" })),
    );

    // Then it is refused.
    assertInstanceOf(error, SimKmsInvalidKeyUsageException);
  });

  it("refuses imported key material", async () => {
    // Given a simulation that generates its own key material.
    const simAws = new SimAws();

    // When an external origin is asked for.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().createKey(new CreateKeyCommand({ Origin: "EXTERNAL" })),
    );

    // Then it is refused.
    assertInstanceOf(error, SimKmsValidationException);
  });

  it("refuses a key policy that is not valid JSON", async () => {
    // Given a simulation.
    const simAws = new SimAws();

    // When the policy is not a policy document.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().createKey(new CreateKeyCommand({ Policy: "not json" })),
    );

    // Then it is refused.
    assertInstanceOf(error, SimKmsValidationException);
  });

  it("accepts an explicit symmetric key spec and usage", async () => {
    // Given a simulation.
    const simAws = new SimAws();

    // When the defaults are stated explicitly, as CDK and CloudFormation do.
    const created = await simAws.kms().createKey(
      new CreateKeyCommand({
        KeySpec: "SYMMETRIC_DEFAULT",
        KeyUsage: "ENCRYPT_DECRYPT",
        Origin: "AWS_KMS",
        Description: "Application key",
      }),
    );

    // Then the key is created with the description it was given.
    assertNonNullable(created.KeyMetadata);
    assertIdentical(created.KeyMetadata.Description, "Application key");
    assertInstanceOf(created.KeyMetadata.CreationDate, Date);
  });
});

describe("KMS cryptographic operation validation", () => {
  it("refuses an encryption algorithm a symmetric key does not support", async () => {
    // Given a symmetric key.
    const simAws = new SimAws();
    const created = await simAws.kms().createKey(new CreateKeyCommand({}));

    // When an asymmetric algorithm is named on Encrypt.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().encrypt(
        new EncryptCommand({
          KeyId: created.KeyMetadata?.Arn,
          Plaintext: plaintext,
          EncryptionAlgorithm: "RSAES_OAEP_SHA_256",
        }),
      ),
    );

    // Then it is refused.
    assertInstanceOf(error, SimKmsInvalidKeyUsageException);
  });

  it("refuses an unsupported encryption algorithm on Decrypt", async () => {
    // Given a simulation.
    const simAws = new SimAws();

    // When an asymmetric algorithm is named on Decrypt.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().decrypt(
        new DecryptCommand({
          CiphertextBlob: Uint8Array.from([1, 2, 3]),
          EncryptionAlgorithm: "RSAES_OAEP_SHA_256",
        }),
      ),
    );

    // Then it is refused before the ciphertext is even read.
    assertInstanceOf(error, SimKmsInvalidKeyUsageException);
  });

  it("refuses Encrypt with no plaintext", async () => {
    // Given a key.
    const simAws = new SimAws();
    const created = await simAws.kms().createKey(new CreateKeyCommand({}));

    // When no plaintext is supplied.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().encrypt({ input: { KeyId: created.KeyMetadata?.Arn } }),
    );

    // Then the request is invalid.
    assertInstanceOf(error, SimKmsValidationException);
  });

  it("refuses Decrypt with no ciphertext", async () => {
    // Given a simulation.
    const simAws = new SimAws();

    // When no ciphertext is supplied.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().decrypt(new DecryptCommand({})),
    );

    // Then the request is invalid.
    assertInstanceOf(error, SimKmsValidationException);
  });

  it("refuses an unsupported data key spec", async () => {
    // Given a key.
    const simAws = new SimAws();
    const created = await simAws.kms().createKey(new CreateKeyCommand({}));

    // When an unknown key spec is asked for.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().generateDataKey({
        input: { KeyId: created.KeyMetadata?.Arn, KeySpec: "AES_512" },
      }),
    );

    // Then it is refused.
    assertInstanceOf(error, SimKmsValidationException);
  });

  it("refuses a data key byte count outside the allowed range", async () => {
    // Given a key.
    const simAws = new SimAws();
    const created = await simAws.kms().createKey(new CreateKeyCommand({}));

    // When more bytes than KMS will produce are asked for.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().generateDataKey(
        new GenerateDataKeyCommand({
          KeyId: created.KeyMetadata?.Arn,
          NumberOfBytes: 2048,
        }),
      ),
    );

    // Then it is refused.
    assertInstanceOf(error, SimKmsValidationException);
  });

  it("generates a 128 bit data key", async () => {
    // Given a key.
    const simAws = new SimAws();
    const created = await simAws.kms().createKey(new CreateKeyCommand({}));

    // When the smaller AES key spec is asked for.
    const generated = await simAws.kms().generateDataKey(
      new GenerateDataKeyCommand({
        KeyId: created.KeyMetadata?.Arn,
        KeySpec: "AES_128",
      }),
    );

    // Then sixteen bytes come back.
    assertInstanceOf(generated.Plaintext, Uint8Array);
    assertIdentical(generated.Plaintext.byteLength, 16);
  });
});

describe("KMS CreateAlias validation", () => {
  it("refuses a missing alias name", async () => {
    // Given a key.
    const simAws = new SimAws();
    const created = await simAws.kms().createKey(new CreateKeyCommand({}));

    // When no alias name is supplied.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .kms()
        .createAlias({ input: { TargetKeyId: created.KeyMetadata?.KeyId } }),
    );

    // Then the request is invalid.
    assertInstanceOf(error, SimKmsValidationException);
  });
});
