import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { SimKmsKeyUsage } from "./spec/sim-kms-key-spec.js";
import type { SimKmsKeyManager, SimKmsKeyState } from "./sim-kms-key.js";

/**
 * The KeyMetadata structure CreateKey and DescribeKey return.
 *
 * The key type fields are read from the key's own spec. Application code uses
 * them to decide what a key can do, so a key that signs has to say so.
 */
export interface SimKmsKeyMetadata {
  readonly AWSAccountId: SimAwsAccountId;
  readonly KeyId: string;
  readonly Arn: string;
  readonly CreationDate: Date;
  readonly Enabled: boolean;
  readonly Description: string;
  readonly KeyUsage: SimKmsKeyUsage;
  readonly KeyState: SimKmsKeyState;
  readonly DeletionDate?: Date | undefined;
  readonly Origin: "AWS_KMS";
  readonly KeyManager: SimKmsKeyManager;
  readonly KeySpec: string;
  readonly CustomerMasterKeySpec: string;
  readonly EncryptionAlgorithms?: readonly string[] | undefined;
  readonly SigningAlgorithms?: readonly string[] | undefined;
  readonly MultiRegion: false;
}
