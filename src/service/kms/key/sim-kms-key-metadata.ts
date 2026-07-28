import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type {
  SimKmsKey,
  SimKmsKeyManager,
  SimKmsKeyState,
} from "./sim-kms-key.js";

/**
 * The KeyMetadata structure CreateKey and DescribeKey return.
 *
 * Only symmetric encryption keys are simulated, so the fields describing key
 * type are constants rather than stored state. They are reported anyway
 * because application code reads them to decide what a key can do.
 */
export interface SimKmsKeyMetadata {
  readonly AWSAccountId: SimAwsAccountId;
  readonly KeyId: string;
  readonly Arn: string;
  readonly CreationDate: Date;
  readonly Enabled: boolean;
  readonly Description: string;
  readonly KeyUsage: "ENCRYPT_DECRYPT";
  readonly KeyState: SimKmsKeyState;
  readonly DeletionDate?: Date | undefined;
  readonly Origin: "AWS_KMS";
  readonly KeyManager: SimKmsKeyManager;
  readonly KeySpec: "SYMMETRIC_DEFAULT";
  readonly CustomerMasterKeySpec: "SYMMETRIC_DEFAULT";
  readonly EncryptionAlgorithms: readonly ["SYMMETRIC_DEFAULT"];
  readonly MultiRegion: false;
}

/**
 * Builds the AWS-shaped view of a stored key.
 *
 * Kept apart from SimKmsKey so the stored key stays a model of what a key is
 * and does, rather than also owning the shape two commands happen to return.
 */
export class SimKmsKeyMetadataView {
  private readonly accountId: SimAwsAccountId;

  constructor(accountId: SimAwsAccountId) {
    this.accountId = accountId;
  }

  /**
   * Describe a key the way KMS reports it.
   */
  describe(key: SimKmsKey): SimKmsKeyMetadata {
    return {
      AWSAccountId: this.accountId,
      KeyId: key.keyId,
      Arn: key.arn,
      CreationDate: new Date(key.creationDate),
      Enabled: key.isEnabled,
      Description: key.description,
      KeyUsage: "ENCRYPT_DECRYPT",
      KeyState: key.keyState,
      DeletionDate: this.copied(key.deletionDate),
      Origin: "AWS_KMS",
      KeyManager: key.keyManager,
      KeySpec: "SYMMETRIC_DEFAULT",
      CustomerMasterKeySpec: "SYMMETRIC_DEFAULT",
      EncryptionAlgorithms: ["SYMMETRIC_DEFAULT"],
      MultiRegion: false,
    };
  }

  /**
   * Copy a date, so the response never hands out the key's own instance.
   */
  private copied(date: Date | undefined): Date | undefined {
    if (date === undefined) {
      return undefined;
    }

    return new Date(date);
  }
}
