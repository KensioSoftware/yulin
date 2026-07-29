import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { SimSecretsManagerEncryptedValue } from "./sim-secrets-manager-encrypted-value.js";
import { SimSecretsManagerSecretValue } from "./sim-secrets-manager-secret-value.js";

/**
 * The cipher a data key encrypts a secret value with.
 *
 * This is the half of envelope encryption that does not happen inside KMS.
 * KMS produces and later recovers the data key; the value itself is encrypted
 * out here with AES-256-GCM, which is what the AWS Encryption SDK does with a
 * data key too.
 */
const algorithm = "aes-256-gcm";
const ivLength = 12;

/**
 * Encrypts and decrypts a secret value under a plaintext data key.
 *
 * The encryption context is not bound in here. KMS binds it to the data key,
 * so a decryption naming a different secret or version fails at the KMS call
 * rather than at this cipher, which is where real Secrets Manager fails too.
 */
export class SimSecretsManagerValueCipher {
  /**
   * Encrypt a value under a data key.
   */
  seal(
    value: SimSecretsManagerSecretValue,
    dataKey: Uint8Array,
    dataKeyCiphertext: Uint8Array,
  ): SimSecretsManagerEncryptedValue {
    const iv = randomBytes(ivLength);
    const cipher = createCipheriv(algorithm, dataKey, iv);

    const ciphertext = Buffer.concat([
      cipher.update(value.bytes),
      cipher.final(),
    ]);

    return new SimSecretsManagerEncryptedValue({
      dataKeyCiphertext,
      iv: Uint8Array.from(iv),
      authTag: Uint8Array.from(cipher.getAuthTag()),
      ciphertext: Uint8Array.from(ciphertext),
      digest: value.digest,
    });
  }

  /**
   * Decrypt a value with the data key KMS recovered for it.
   */
  open(
    encrypted: SimSecretsManagerEncryptedValue,
    dataKey: Uint8Array,
  ): SimSecretsManagerSecretValue {
    const decipher = createDecipheriv(algorithm, dataKey, encrypted.iv);
    decipher.setAuthTag(encrypted.authTag);

    const plaintext = Buffer.concat([
      decipher.update(encrypted.ciphertext),
      decipher.final(),
    ]);

    return SimSecretsManagerSecretValue.fromBytes(Uint8Array.from(plaintext));
  }
}
