import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";

/**
 * The alias of the AWS managed key Parameter Store encrypts with when a
 * request names no key of its own.
 *
 * Simulated KMS creates the key behind a reserved `alias/aws/` name the first
 * time something asks for it, which is how such a key comes into existence on
 * real AWS too: nobody creates it, the service that needs it does.
 */
export const ssmDefaultKeyAlias = "alias/aws/ssm";

/**
 * The service Parameter Store's KMS calls are made through, as
 * `kms:ViaService` names it.
 *
 * Supplying it is what lets a caller read a `SecureString` under the
 * `aws/ssm` managed key with no KMS permission of its own: that key's policy
 * admits the Account's principals only when the request reached KMS through
 * Systems Manager.
 */
export const ssmKmsViaService = "ssm";

/**
 * The narrow slice of simulated KMS that SecureString parameters need.
 *
 * Standard tier Parameter Store encrypts under the key directly rather than
 * through a data key, so Encrypt and Decrypt are the whole of it.
 * SimKms structurally implements this interface.
 */
export interface SimSsmKmsCrypto {
  encrypt(
    command: {
      input: {
        KeyId?: string | undefined;
        Plaintext?: Uint8Array | undefined;
        EncryptionContext?: Readonly<Record<string, string>> | undefined;
      };
    },
    options?: {
      caller?: SimAwsCaller | undefined;
      viaService?: string | undefined;
    },
  ): Promise<{
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
    options?: {
      caller?: SimAwsCaller | undefined;
      viaService?: string | undefined;
    },
  ): Promise<{
    Plaintext?: Uint8Array | undefined;
    KeyId?: string | undefined;
  }>;
}
