import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";

/**
 * The alias of the AWS managed key Secrets Manager encrypts with when a secret
 * names no key of its own.
 *
 * Simulated KMS creates the key behind a reserved `alias/aws/` name the first
 * time something asks for it, which is how such a key comes into existence on
 * real AWS too: nobody creates it, the service that needs it does.
 */
export const secretsManagerDefaultKeyAlias = "alias/aws/secretsmanager";

/**
 * The service Secrets Manager's KMS calls are made through, as
 * `kms:ViaService` names it.
 *
 * Supplying it is what keeps the common case as convenient here as it is on
 * real AWS: the `aws/secretsmanager` key's policy admits the account's
 * principals when the request reaches KMS through Secrets Manager, so a caller
 * allowed only `secretsmanager:GetSecretValue` reads the secret.
 */
export const secretsManagerKmsViaService = "secretsmanager";

/**
 * The data key length Secrets Manager asks KMS for.
 */
export const secretsManagerDataKeySpec = "AES_256";

interface SimSecretsManagerKmsOptions {
  readonly caller?: SimAwsCaller | undefined;
  readonly viaService?: string | undefined;
}

/**
 * The narrow slice of simulated KMS that secret values need.
 *
 * Real Secrets Manager uses envelope encryption: it asks KMS for a data key
 * per version, encrypts the value with the plaintext copy and keeps the
 * encrypted copy beside the ciphertext. That is why a write needs
 * `kms:GenerateDataKey` and a read needs `kms:Decrypt`, rather than both
 * needing `kms:Encrypt` and `kms:Decrypt` as a direct encryption would.
 *
 * SimKms structurally implements this interface.
 */
export interface SimSecretsManagerKmsCrypto {
  generateDataKey(
    command: {
      input: {
        KeyId?: string | undefined;
        KeySpec?: string | undefined;
        EncryptionContext?: Readonly<Record<string, string>> | undefined;
      };
    },
    options?: SimSecretsManagerKmsOptions,
  ): Promise<{
    Plaintext?: Uint8Array | undefined;
    CiphertextBlob?: Uint8Array | undefined;
    KeyId?: string | undefined;
  }>;

  decrypt(
    command: {
      input: {
        CiphertextBlob?: Uint8Array | undefined;
        EncryptionContext?: Readonly<Record<string, string>> | undefined;
      };
    },
    options?: SimSecretsManagerKmsOptions,
  ): Promise<{
    Plaintext?: Uint8Array | undefined;
    KeyId?: string | undefined;
  }>;
}
