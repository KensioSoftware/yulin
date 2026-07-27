import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimKmsEncryptionContext } from "../../key/sim-kms-encryption-context.js";

/**
 * Minimal structural sim KMS Encrypt command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/kms/command/EncryptCommand/
 */
export interface SimEncryptCommand {
  readonly input: SimEncryptCommandInput;
}

export interface SimEncryptCommandInput {
  readonly KeyId?: string | undefined;
  readonly Plaintext?: Uint8Array | undefined;
  readonly EncryptionContext?: SimKmsEncryptionContext | undefined;
  readonly EncryptionAlgorithm?: string | undefined;
}

export interface SimEncryptCommandOutput {
  readonly CiphertextBlob?: Uint8Array | undefined;
  readonly KeyId?: string | undefined;
  readonly EncryptionAlgorithm?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim KMS Decrypt command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/kms/command/DecryptCommand/
 */
export interface SimDecryptCommand {
  readonly input: SimDecryptCommandInput;
}

export interface SimDecryptCommandInput {
  readonly CiphertextBlob?: Uint8Array | undefined;

  /**
   * Optional for a symmetric key, because the ciphertext names the key that
   * produced it. Supplying it asks KMS to check that expectation, and the
   * request fails if the ciphertext came from a different key.
   */
  readonly KeyId?: string | undefined;

  readonly EncryptionContext?: SimKmsEncryptionContext | undefined;
  readonly EncryptionAlgorithm?: string | undefined;
}

export interface SimDecryptCommandOutput {
  readonly Plaintext?: Uint8Array | undefined;
  readonly KeyId?: string | undefined;
  readonly EncryptionAlgorithm?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim KMS GenerateDataKey command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/kms/command/GenerateDataKeyCommand/
 */
export interface SimGenerateDataKeyCommand {
  readonly input: SimGenerateDataKeyCommandInput;
}

export interface SimGenerateDataKeyCommandInput {
  readonly KeyId?: string | undefined;
  readonly KeySpec?: string | undefined;
  readonly NumberOfBytes?: number | undefined;
  readonly EncryptionContext?: SimKmsEncryptionContext | undefined;
}

export interface SimGenerateDataKeyCommandOutput {
  readonly CiphertextBlob?: Uint8Array | undefined;
  readonly Plaintext?: Uint8Array | undefined;
  readonly KeyId?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}
