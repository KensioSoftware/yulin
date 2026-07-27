import {
  CreateKeyCommand,
  DecryptCommand,
  EncryptCommand,
  GenerateDataKeyCommand,
} from "@aws-sdk/client-kms";
import {
  assertNonNullable,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimKmsIncorrectKeyException,
  SimKmsInvalidCiphertextException,
  SimKmsValidationException,
} from "../../error/sim-kms.error.js";

const plaintext = (value: string): Uint8Array =>
  Uint8Array.from(Buffer.from(value, "utf8"));

const text = (value: Uint8Array | undefined): string =>
  Buffer.from(value ?? new Uint8Array()).toString("utf8");

async function keyArnFor(simAws: SimAws): Promise<string> {
  const created = await simAws.kms().createKey(new CreateKeyCommand({}));
  assertNonNullable(created.KeyMetadata);
  return created.KeyMetadata.Arn;
}

describe("KMS Encrypt and Decrypt", () => {
  it("round-trips plaintext through a key", async () => {
    // Given a simulated KMS key.
    const simAws = new SimAws();
    const keyArn = await keyArnFor(simAws);

    // When plaintext is encrypted and the ciphertext decrypted again.
    const encrypted = await simAws
      .kms()
      .encrypt(
        new EncryptCommand({ KeyId: keyArn, Plaintext: plaintext("hunter2") }),
      );
    const decrypted = await simAws
      .kms()
      .decrypt(
        new DecryptCommand({ CiphertextBlob: encrypted.CiphertextBlob }),
      );

    // Then the original plaintext comes back, from the key the blob names.
    assertIdentical(text(decrypted.Plaintext), "hunter2");
    assertIdentical(decrypted.KeyId, keyArn);
    assertIdentical(decrypted.EncryptionAlgorithm, "SYMMETRIC_DEFAULT");
  });

  it("produces a ciphertext that is not the plaintext", async () => {
    // Given a simulated KMS key.
    const simAws = new SimAws();
    const keyArn = await keyArnFor(simAws);

    // When a recognisable plaintext is encrypted.
    const encrypted = await simAws
      .kms()
      .encrypt(
        new EncryptCommand({ KeyId: keyArn, Plaintext: plaintext("hunter2") }),
      );

    // Then the blob does not contain it: this is real AES-256-GCM, not a
    // simulator pretending to encrypt.
    assertNonNullable(encrypted.CiphertextBlob);
    assertTrue(
      !Buffer.from(encrypted.CiphertextBlob).includes(
        Buffer.from("hunter2", "utf8"),
      ),
    );
  });

  it("fails to decrypt when the encryption context differs", async () => {
    // Given a ciphertext encrypted with an encryption context.
    const simAws = new SimAws();
    const keyArn = await keyArnFor(simAws);

    const encrypted = await simAws.kms().encrypt(
      new EncryptCommand({
        KeyId: keyArn,
        Plaintext: plaintext("hunter2"),
        EncryptionContext: { tenant: "acme" },
      }),
    );

    // When decryption supplies a different context.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().decrypt(
        new DecryptCommand({
          CiphertextBlob: encrypted.CiphertextBlob,
          EncryptionContext: { tenant: "other" },
        }),
      ),
    );

    // Then the ciphertext will not open, as on real KMS.
    assertInstanceOf(error, SimKmsInvalidCiphertextException);
  });

  it("fails to decrypt when the encryption context is omitted", async () => {
    // Given a ciphertext encrypted with an encryption context.
    const simAws = new SimAws();
    const keyArn = await keyArnFor(simAws);

    const encrypted = await simAws.kms().encrypt(
      new EncryptCommand({
        KeyId: keyArn,
        Plaintext: plaintext("hunter2"),
        EncryptionContext: { tenant: "acme" },
      }),
    );

    // When decryption supplies no context at all.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .kms()
        .decrypt(
          new DecryptCommand({ CiphertextBlob: encrypted.CiphertextBlob }),
        ),
    );

    // Then it fails: the context is part of what the ciphertext is bound to.
    assertInstanceOf(error, SimKmsInvalidCiphertextException);
  });

  it("decrypts when the same context is given in a different order", async () => {
    // Given a ciphertext encrypted with a two-entry encryption context.
    const simAws = new SimAws();
    const keyArn = await keyArnFor(simAws);

    const encrypted = await simAws.kms().encrypt(
      new EncryptCommand({
        KeyId: keyArn,
        Plaintext: plaintext("hunter2"),
        EncryptionContext: { tenant: "acme", purpose: "db" },
      }),
    );

    // When decryption supplies the same pairs written the other way round.
    const decrypted = await simAws.kms().decrypt(
      new DecryptCommand({
        CiphertextBlob: encrypted.CiphertextBlob,
        EncryptionContext: { purpose: "db", tenant: "acme" },
      }),
    );

    // Then it succeeds, because the context is an unordered map.
    assertIdentical(text(decrypted.Plaintext), "hunter2");
  });

  it("cannot decrypt a ciphertext from a different key", async () => {
    // Given two keys, and a ciphertext produced under the first.
    const simAws = new SimAws();
    const firstKeyArn = await keyArnFor(simAws);
    const secondKeyArn = await keyArnFor(simAws);

    const encrypted = await simAws.kms().encrypt(
      new EncryptCommand({
        KeyId: firstKeyArn,
        Plaintext: plaintext("hunter2"),
      }),
    );

    // When the second key is named on decryption.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().decrypt(
        new DecryptCommand({
          CiphertextBlob: encrypted.CiphertextBlob,
          KeyId: secondKeyArn,
        }),
      ),
    );

    // Then KMS reports the caller's expectation was wrong.
    assertInstanceOf(error, SimKmsIncorrectKeyException);
  });

  it("rejects bytes that are not one of its ciphertexts", async () => {
    // Given a simulated KMS with a key.
    const simAws = new SimAws();
    await keyArnFor(simAws);

    // When arbitrary bytes are handed to Decrypt.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().decrypt(
        new DecryptCommand({
          CiphertextBlob: Uint8Array.from([1, 2, 3, 4]),
        }),
      ),
    );

    // Then they are an invalid ciphertext rather than a missing key.
    assertInstanceOf(error, SimKmsInvalidCiphertextException);
  });

  it("refuses plaintext beyond the symmetric key limit", async () => {
    // Given a simulated KMS key.
    const simAws = new SimAws();
    const keyArn = await keyArnFor(simAws);

    // When more than 4096 bytes are offered to Encrypt.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().encrypt(
        new EncryptCommand({
          KeyId: keyArn,
          Plaintext: new Uint8Array(4097),
        }),
      ),
    );

    // Then it is refused, which is the limit envelope encryption exists for.
    assertInstanceOf(error, SimKmsValidationException);
    assertStringIncludes(error.message, "GenerateDataKey");
  });
});

describe("KMS GenerateDataKey", () => {
  it("returns a data key in the clear and encrypted under the key", async () => {
    // Given a simulated KMS key.
    const simAws = new SimAws();
    const keyArn = await keyArnFor(simAws);

    // When a data key is generated.
    const generated = await simAws
      .kms()
      .generateDataKey(
        new GenerateDataKeyCommand({ KeyId: keyArn, KeySpec: "AES_256" }),
      );

    // Then both copies come back, and the encrypted one decrypts to the other.
    assertNonNullable(generated.Plaintext);
    assertIdentical(generated.Plaintext.byteLength, 32);

    const decrypted = await simAws
      .kms()
      .decrypt(
        new DecryptCommand({ CiphertextBlob: generated.CiphertextBlob }),
      );

    const recovered = Buffer.from(decrypted.Plaintext ?? new Uint8Array());
    assertIdentical(
      recovered.toString("hex"),
      Buffer.from(generated.Plaintext).toString("hex"),
    );
  });

  it("generates the requested number of bytes", async () => {
    // Given a simulated KMS key.
    const simAws = new SimAws();
    const keyArn = await keyArnFor(simAws);

    // When a byte count is asked for instead of a key spec.
    const generated = await simAws
      .kms()
      .generateDataKey(
        new GenerateDataKeyCommand({ KeyId: keyArn, NumberOfBytes: 64 }),
      );

    // Then that many bytes come back.
    assertIdentical(generated.Plaintext?.byteLength, 64);
  });

  it("refuses both KeySpec and NumberOfBytes together", async () => {
    // Given a simulated KMS key.
    const simAws = new SimAws();
    const keyArn = await keyArnFor(simAws);

    // When both are supplied.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().generateDataKey(
        new GenerateDataKeyCommand({
          KeyId: keyArn,
          KeySpec: "AES_256",
          NumberOfBytes: 32,
        }),
      ),
    );

    // Then KMS refuses, as it does on real AWS.
    assertInstanceOf(error, SimKmsValidationException);
  });

  it("refuses neither KeySpec nor NumberOfBytes", async () => {
    // Given a simulated KMS key.
    const simAws = new SimAws();
    const keyArn = await keyArnFor(simAws);

    // When neither is supplied.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .kms()
        .generateDataKey(new GenerateDataKeyCommand({ KeyId: keyArn })),
    );

    // Then KMS refuses rather than picking a length.
    assertInstanceOf(error, SimKmsValidationException);
  });
});
