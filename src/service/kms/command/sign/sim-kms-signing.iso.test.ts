import { createPublicKey, verify } from "node:crypto";
import {
  CreateKeyCommand,
  DescribeKeyCommand,
  GetPublicKeyCommand,
  SignCommand,
  VerifyCommand,
  type KeySpec,
} from "@aws-sdk/client-kms";
import {
  assertArrayIncludes,
  assertUndefined,
  assertIdentical,
  assertNonNullable,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";

const message = (value: string): Uint8Array =>
  Uint8Array.from(Buffer.from(value, "utf8"));

async function signingKeyArn(
  simAws: SimAws,
  KeySpec: KeySpec,
): Promise<string> {
  const created = await simAws
    .kms()
    .createKey(new CreateKeyCommand({ KeySpec, KeyUsage: "SIGN_VERIFY" }));
  assertNonNullable(created.KeyMetadata);

  return created.KeyMetadata.Arn;
}

describe("KMS Sign and Verify", () => {
  it("round-trips a signature through an ECC key", async () => {
    // Given a simulated ECC signing key.
    const simAws = new SimAws();
    const keyArn = await signingKeyArn(simAws, "ECC_NIST_P256");

    // When a message is signed and the signature verified.
    const signed = await simAws.kms().sign(
      new SignCommand({
        KeyId: keyArn,
        Message: message("zone apex"),
        SigningAlgorithm: "ECDSA_SHA_256",
      }),
    );
    const verified = await simAws.kms().verify(
      new VerifyCommand({
        KeyId: keyArn,
        Message: message("zone apex"),
        Signature: signed.Signature,
        SigningAlgorithm: "ECDSA_SHA_256",
      }),
    );

    // Then the signature checks out, against the key that made it.
    assertTrue(verified.SignatureValid);
    assertIdentical(verified.KeyId, keyArn);
    assertIdentical(signed.SigningAlgorithm, "ECDSA_SHA_256");
  });

  it("round-trips a signature through an RSA key", async () => {
    // Given a simulated RSA signing key.
    const simAws = new SimAws();
    const keyArn = await signingKeyArn(simAws, "RSA_2048");

    // When a message is signed with PSS padding and verified.
    const signed = await simAws.kms().sign(
      new SignCommand({
        KeyId: keyArn,
        Message: message("licence"),
        SigningAlgorithm: "RSASSA_PSS_SHA_256",
      }),
    );
    const verified = await simAws.kms().verify(
      new VerifyCommand({
        KeyId: keyArn,
        Message: message("licence"),
        Signature: signed.Signature,
        SigningAlgorithm: "RSASSA_PSS_SHA_256",
      }),
    );

    // Then the signature checks out.
    assertTrue(verified.SignatureValid);
  });

  it("signs with real cryptography a public key verifies", async () => {
    // Given a signing key and its public key.
    const simAws = new SimAws();
    const keyArn = await signingKeyArn(simAws, "ECC_NIST_P384");
    const publicKey = await simAws
      .kms()
      .getPublicKey(new GetPublicKeyCommand({ KeyId: keyArn }));
    assertNonNullable(publicKey.PublicKey);

    // When a message is signed here and checked outside the simulation.
    const signed = await simAws.kms().sign(
      new SignCommand({
        KeyId: keyArn,
        Message: message("out of band"),
        SigningAlgorithm: "ECDSA_SHA_384",
      }),
    );

    // Then Node's own verifier accepts it against the DER public key, so the
    // signature means something outside this process.
    const verifier = createPublicKey({
      key: Buffer.from(publicKey.PublicKey),
      format: "der",
      type: "spki",
    });

    assertTrue(
      verify(
        "sha384",
        message("out of band"),
        verifier,
        signed.Signature ?? new Uint8Array(),
      ),
    );
  });

  it("reports the key type of a signing key", async () => {
    // Given a simulated ECC signing key.
    const simAws = new SimAws();
    const keyArn = await signingKeyArn(simAws, "ECC_NIST_P256");

    // When the key is described.
    const described = await simAws
      .kms()
      .describeKey(new DescribeKeyCommand({ KeyId: keyArn }));
    assertNonNullable(described.KeyMetadata);

    // Then it reports its own spec and usage rather than the symmetric
    // defaults, and lists no encryption algorithms, because it has none.
    assertIdentical(described.KeyMetadata.KeySpec, "ECC_NIST_P256");
    assertIdentical(
      described.KeyMetadata.CustomerMasterKeySpec,
      "ECC_NIST_P256",
    );
    assertIdentical(described.KeyMetadata.KeyUsage, "SIGN_VERIFY");
    assertArrayIncludes(
      described.KeyMetadata.SigningAlgorithms ?? [],
      "ECDSA_SHA_256",
    );
    assertUndefined(described.KeyMetadata.EncryptionAlgorithms);
  });

  it("reports the key type of a symmetric key", async () => {
    // Given a simulated symmetric key.
    const simAws = new SimAws();
    const created = await simAws.kms().createKey(new CreateKeyCommand({}));
    assertNonNullable(created.KeyMetadata);

    // When the key is described, then it lists no signing algorithms.
    const described = await simAws
      .kms()
      .describeKey(new DescribeKeyCommand({ KeyId: created.KeyMetadata.Arn }));
    assertNonNullable(described.KeyMetadata);

    assertIdentical(described.KeyMetadata.KeySpec, "SYMMETRIC_DEFAULT");
    assertIdentical(described.KeyMetadata.KeyUsage, "ENCRYPT_DECRYPT");
    assertUndefined(described.KeyMetadata.SigningAlgorithms);
    assertArrayIncludes(
      described.KeyMetadata.EncryptionAlgorithms ?? [],
      "SYMMETRIC_DEFAULT",
    );
  });

  it("reports the public key type from GetPublicKey", async () => {
    // Given a simulated RSA signing key.
    const simAws = new SimAws();
    const keyArn = await signingKeyArn(simAws, "RSA_3072");

    // When its public key is fetched.
    const publicKey = await simAws
      .kms()
      .getPublicKey(new GetPublicKeyCommand({ KeyId: keyArn }));

    // Then it carries the key type alongside the key, as real KMS does.
    assertIdentical(publicKey.KeyId, keyArn);
    assertIdentical(publicKey.KeySpec, "RSA_3072");
    assertIdentical(publicKey.KeyUsage, "SIGN_VERIFY");
    assertArrayIncludes(
      publicKey.SigningAlgorithms ?? [],
      "RSASSA_PKCS1_V1_5_SHA_512",
    );
  });
});
