import type { SimKmsCiphertextBlob } from "./sim-kms-ciphertext-blob.js";
import type { SimKmsKeyMaterial } from "./sim-kms-key-material.js";
import { SimKmsSigningKeyMaterial } from "./sim-kms-signing-key-material.js";
import { SimKmsSymmetricKeyMaterial } from "./sim-kms-symmetric-key-material.js";
import type { SimKmsKeySpec } from "./spec/sim-kms-key-spec.js";

interface SimKmsMakeKeyMaterialProperties {
  readonly keyArn: string;
  readonly keySpec: SimKmsKeySpec;
  readonly blob: SimKmsCiphertextBlob;
}

/**
 * Make the key material a key spec calls for: an AES key or a key pair.
 *
 * Which of the two a spec means is the only thing the key factory would have
 * to know about key material, so it lives here instead and the factory stays
 * about assembling a key.
 */
export function makeSimKmsKeyMaterial(
  properties: SimKmsMakeKeyMaterialProperties,
): SimKmsKeyMaterial {
  const { keyArn, keySpec } = properties;

  if (keySpec.isAsymmetric) {
    return new SimKmsSigningKeyMaterial({ keyArn, keySpec });
  }

  return new SimKmsSymmetricKeyMaterial({
    keyArn,
    keySpec,
    blob: properties.blob,
  });
}
