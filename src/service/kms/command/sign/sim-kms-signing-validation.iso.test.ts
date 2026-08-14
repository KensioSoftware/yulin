import {
  CreateKeyCommand,
  EncryptCommand,
  GetPublicKeyCommand,
  SignCommand,
  VerifyCommand,
  type KeySpec,
} from "@aws-sdk/client-kms";
import {
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimKmsInvalidKeyUsageException,
  SimKmsInvalidSignatureException,
  SimKmsUnsupportedOperationException,
  SimKmsValidationException,
} from "../../error/sim-kms.error.js";

const message = (value: string): Uint8Array =>
  Uint8Array.from(Buffer.from(value, "utf8"));

async function symmetricKeyArn(simAws: SimAws): Promise<string> {
  const created = await simAws.kms().createKey(new CreateKeyCommand({}));
  assertNonNullable(created.KeyMetadata);

  return created.KeyMetadata.Arn;
}

async function keyArn(simAws: SimAws, KeySpec: KeySpec): Promise<string> {
  const created = await simAws
    .kms()
    .createKey(new CreateKeyCommand({ KeySpec, KeyUsage: "SIGN_VERIFY" }));
  assertNonNullable(created.KeyMetadata);

  return created.KeyMetadata.Arn;
}

async function signedBy(
  simAws: SimAws,
  signingKeyArn: string,
): Promise<Uint8Array> {
  const signed = await simAws.kms().sign(
    new SignCommand({
      KeyId: signingKeyArn,
      Message: message("zone apex"),
      SigningAlgorithm: "ECDSA_SHA_256",
    }),
  );
  assertNonNullable(signed.Signature);

  return signed.Signature;
}

describe("KMS signing validation", () => {
  it("refuses a signature that does not check out", async () => {
    // Given a signing key and a signature over one message.
    const simAws = new SimAws();
    const signingKeyArn = await keyArn(simAws, "ECC_NIST_P256");
    const signature = await signedBy(simAws, signingKeyArn);

    // When the signature is verified against a different message.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().verify(
        new VerifyCommand({
          KeyId: signingKeyArn,
          Message: message("some other zone"),
          Signature: signature,
          SigningAlgorithm: "ECDSA_SHA_256",
        }),
      ),
    );

    // Then it fails rather than reporting SignatureValid false, which is how
    // real KMS reports it.
    assertInstanceOf(error, SimKmsInvalidSignatureException);
  });

  it("refuses a signature made under another key", async () => {
    // Given two signing keys, and a signature from the first.
    const simAws = new SimAws();
    const signingKeyArn = await keyArn(simAws, "ECC_NIST_P256");
    const otherKeyArn = await keyArn(simAws, "ECC_NIST_P256");
    const signature = await signedBy(simAws, signingKeyArn);

    // When the signature is verified against the second key.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().verify(
        new VerifyCommand({
          KeyId: otherKeyArn,
          Message: message("zone apex"),
          Signature: signature,
          SigningAlgorithm: "ECDSA_SHA_256",
        }),
      ),
    );

    // Then it fails, because the cryptography here is real.
    assertInstanceOf(error, SimKmsInvalidSignatureException);
  });

  it("refuses a Verify with no signature", async () => {
    // Given a signing key.
    const simAws = new SimAws();
    const signingKeyArn = await keyArn(simAws, "ECC_NIST_P256");

    // When a verification carries no signature.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().verify({
        input: {
          KeyId: signingKeyArn,
          Message: message("zone apex"),
          SigningAlgorithm: "ECDSA_SHA_256",
        },
      }),
    );

    // Then it is a validation failure rather than a signature that did not
    // verify. The two mean different things to a caller.
    assertInstanceOf(error, SimKmsValidationException);
  });

  it("refuses a signature larger than KMS accepts", async () => {
    // Given a signing key.
    const simAws = new SimAws();
    const signingKeyArn = await keyArn(simAws, "ECC_NIST_P256");

    // When a signature past the 6144 byte limit is checked.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().verify(
        new VerifyCommand({
          KeyId: signingKeyArn,
          Message: message("zone apex"),
          Signature: new Uint8Array(6145),
          SigningAlgorithm: "ECDSA_SHA_256",
        }),
      ),
    );

    // Then it is refused before any cryptography runs.
    assertInstanceOf(error, SimKmsValidationException);
  });

  it("refuses signing with a symmetric key", async () => {
    // Given a symmetric encryption key.
    const simAws = new SimAws();
    const keyWithNoPair = await symmetricKeyArn(simAws);

    // When it is asked to sign.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().sign(
        new SignCommand({
          KeyId: keyWithNoPair,
          Message: message("zone apex"),
          SigningAlgorithm: "ECDSA_SHA_256",
        }),
      ),
    );

    // Then it is refused for its key usage, before any algorithm question.
    assertInstanceOf(error, SimKmsInvalidKeyUsageException);
    assertStringIncludes(
      error.message,
      "A SYMMETRIC_DEFAULT key cannot sign or verify",
    );
  });

  it("refuses encrypting with a signing key", async () => {
    // Given an asymmetric signing key.
    const simAws = new SimAws();
    const signingKeyArn = await keyArn(simAws, "ECC_NIST_P256");

    // When it is asked to encrypt.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().encrypt(
        new EncryptCommand({
          KeyId: signingKeyArn,
          Plaintext: message("hunter2"),
        }),
      ),
    );

    // Then it is refused, as real KMS refuses it.
    assertInstanceOf(error, SimKmsInvalidKeyUsageException);
    assertStringIncludes(error.message, "its KeyUsage is SIGN_VERIFY");
  });

  it("refuses the public key of a symmetric key", async () => {
    // Given a symmetric key, which has no public key at all.
    const simAws = new SimAws();
    const keyWithNoPair = await symmetricKeyArn(simAws);

    // When its public key is asked for.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .kms()
        .getPublicKey(new GetPublicKeyCommand({ KeyId: keyWithNoPair })),
    );

    // Then it is an unsupported operation rather than a key usage refusal,
    // which is the distinction real KMS makes here.
    assertInstanceOf(error, SimKmsUnsupportedOperationException);
  });

  it("refuses a signing algorithm the key spec does not offer", async () => {
    // Given an ECC signing key.
    const simAws = new SimAws();
    const signingKeyArn = await keyArn(simAws, "ECC_NIST_P256");

    // When it is asked to sign with an RSA algorithm.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().sign(
        new SignCommand({
          KeyId: signingKeyArn,
          Message: message("zone apex"),
          SigningAlgorithm: "RSASSA_PSS_SHA_256",
        }),
      ),
    );

    // Then it is refused, naming the algorithms the key does offer.
    assertInstanceOf(error, SimKmsInvalidKeyUsageException);
    assertStringIncludes(error.message, "ECDSA_SHA_256");
  });

  it("refuses a Sign with no signing algorithm", async () => {
    // Given an ECC signing key.
    const simAws = new SimAws();
    const signingKeyArn = await keyArn(simAws, "ECC_NIST_P256");

    // When the algorithm is left out, which real KMS requires.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .kms()
        .sign({ input: { KeyId: signingKeyArn, Message: message("x") } }),
    );

    // Then it is refused rather than defaulted.
    assertInstanceOf(error, SimKmsInvalidKeyUsageException);
  });

  it("refuses a digest message type", async () => {
    // Given an ECC signing key.
    const simAws = new SimAws();
    const signingKeyArn = await keyArn(simAws, "ECC_NIST_P256");

    // When a pre-hashed message is signed.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().sign(
        new SignCommand({
          KeyId: signingKeyArn,
          Message: message("a digest"),
          MessageType: "DIGEST",
          SigningAlgorithm: "ECDSA_SHA_256",
        }),
      ),
    );

    // Then it is refused rather than signed as if it were the message, which
    // would produce a signature nothing outside this simulation would accept.
    assertInstanceOf(error, SimKmsValidationException);
    assertStringIncludes(
      error.message,
      "MessageType 'DIGEST' is not simulated",
    );
  });

  it("refuses a Sign with no message", async () => {
    // Given an ECC signing key.
    const simAws = new SimAws();
    const signingKeyArn = await keyArn(simAws, "ECC_NIST_P256");

    // When nothing is given to sign.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().sign({
        input: { KeyId: signingKeyArn, SigningAlgorithm: "ECDSA_SHA_256" },
      }),
    );

    // Then it is refused.
    assertInstanceOf(error, SimKmsValidationException);
  });

  it("refuses a message larger than KMS accepts", async () => {
    // Given an ECC signing key.
    const simAws = new SimAws();
    const signingKeyArn = await keyArn(simAws, "ECC_NIST_P256");

    // When a message past the 4096 byte limit is signed.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().sign(
        new SignCommand({
          KeyId: signingKeyArn,
          Message: new Uint8Array(4097),
          SigningAlgorithm: "ECDSA_SHA_256",
        }),
      ),
    );

    // Then it is refused, as real KMS refuses it.
    assertInstanceOf(error, SimKmsValidationException);
  });
});
