import { generateKeyPairSync, sign, verify, type KeyObject } from "node:crypto";
import { SimKmsKeyMaterial } from "./sim-kms-key-material.js";
import type { SimKmsKeySpec } from "./spec/sim-kms-key-spec.js";
import type { SimKmsSigningAlgorithm } from "./spec/sim-kms-signing-algorithm.js";

interface SimKmsSigningKeyMaterialProperties {
  readonly keyArn: string;
  readonly keySpec: SimKmsKeySpec;
}

interface SimKmsKeyPair {
  readonly publicKey: KeyObject;
  readonly privateKey: KeyObject;
}

/**
 * The key pair of one simulated asymmetric KMS signing key.
 *
 * The pair is a real one and the signatures are real signatures: a signature
 * made here verifies against the public key GetPublicKey hands out, using any
 * verifier, and one made over a different message does not. ECDSA signatures
 * come out DER encoded, which is the encoding real KMS returns.
 *
 * The private key never leaves, the same as the AES bytes of a symmetric key.
 */
export class SimKmsSigningKeyMaterial extends SimKmsKeyMaterial {
  private readonly keyPair: SimKmsKeyPair;

  constructor(properties: SimKmsSigningKeyMaterialProperties) {
    super(properties);

    this.keyPair = generateSimKmsKeyPair(properties.keySpec);
  }

  /**
   * Sign a message under this key.
   */
  override sign(
    message: Uint8Array,
    algorithm: SimKmsSigningAlgorithm,
  ): Uint8Array {
    return Uint8Array.from(
      sign(
        algorithm.digest,
        message,
        algorithm.keyInput(this.keyPair.privateKey),
      ),
    );
  }

  /**
   * Check a signature made under this key.
   */
  override verify(
    message: Uint8Array,
    signature: Uint8Array,
    algorithm: SimKmsSigningAlgorithm,
  ): boolean {
    return verify(
      algorithm.digest,
      message,
      algorithm.keyInput(this.keyPair.publicKey),
      signature,
    );
  }

  /**
   * This key's public key, as DER SubjectPublicKeyInfo.
   *
   * That is the encoding real GetPublicKey returns, so a caller can hand the
   * bytes straight to a verifier without knowing they came from a simulator.
   */
  override publicKeyDer(): Uint8Array {
    return Uint8Array.from(
      this.keyPair.publicKey.export({ type: "spki", format: "der" }),
    );
  }
}

/**
 * Generate the key pair a key spec calls for.
 *
 * Kept out of the class so the spec-to-Node translation is one expression
 * rather than a branch inside a constructor.
 */
function generateSimKmsKeyPair(keySpec: SimKmsKeySpec): SimKmsKeyPair {
  const parameters = keySpec.keyPairParameters();

  if (parameters.type === "ec") {
    return generateKeyPairSync("ec", { namedCurve: parameters.namedCurve });
  }

  return generateKeyPairSync("rsa", {
    modulusLength: parameters.modulusLength,
  });
}
