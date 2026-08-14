import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimKmsKeyUsage } from "../../key/spec/sim-kms-key-spec.js";

/**
 * Minimal structural sim KMS Sign command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/kms/command/SignCommand/
 */
export interface SimSignCommand {
  readonly input: SimSignCommandInput;
}

export interface SimSignCommandInput {
  readonly KeyId?: string | undefined;
  readonly Message?: Uint8Array | undefined;

  /**
   * `RAW` only. A `DIGEST` message is refused, because Node cannot sign a
   * digest that has already been computed.
   */
  readonly MessageType?: string | undefined;

  readonly SigningAlgorithm?: string | undefined;
}

export interface SimSignCommandOutput {
  readonly KeyId?: string | undefined;
  readonly Signature?: Uint8Array | undefined;
  readonly SigningAlgorithm?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim KMS Verify command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/kms/command/VerifyCommand/
 */
export interface SimVerifyCommand {
  readonly input: SimVerifyCommandInput;
}

export interface SimVerifyCommandInput {
  readonly KeyId?: string | undefined;
  readonly Message?: Uint8Array | undefined;
  readonly MessageType?: string | undefined;
  readonly Signature?: Uint8Array | undefined;
  readonly SigningAlgorithm?: string | undefined;
}

export interface SimVerifyCommandOutput {
  readonly KeyId?: string | undefined;
  readonly SignatureValid?: boolean | undefined;
  readonly SigningAlgorithm?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim KMS GetPublicKey command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/kms/command/GetPublicKeyCommand/
 */
export interface SimGetPublicKeyCommand {
  readonly input: SimGetPublicKeyCommandInput;
}

export interface SimGetPublicKeyCommandInput {
  readonly KeyId?: string | undefined;
}

export interface SimGetPublicKeyCommandOutput {
  readonly KeyId?: string | undefined;
  readonly PublicKey?: Uint8Array | undefined;
  readonly KeySpec?: string | undefined;
  readonly CustomerMasterKeySpec?: string | undefined;
  readonly KeyUsage?: SimKmsKeyUsage | undefined;
  readonly EncryptionAlgorithms?: readonly string[] | undefined;
  readonly SigningAlgorithms?: readonly string[] | undefined;
  readonly $metadata: SimResponseMetadata;
}
