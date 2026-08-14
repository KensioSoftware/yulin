import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { SimKmsKey } from "./sim-kms-key.js";
import type { SimKmsKeyMetadata } from "./sim-kms-key-metadata.type.js";

export type { SimKmsKeyMetadata } from "./sim-kms-key-metadata.type.js";

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
    const keySpec = key.keySpec;

    return {
      AWSAccountId: this.accountId,
      KeyId: key.keyId,
      Arn: key.arn,
      CreationDate: new Date(key.creationDate),
      Enabled: key.isEnabled,
      Description: key.description,
      KeyUsage: keySpec.keyUsage,
      KeyState: key.keyState,
      DeletionDate: this.copied(key.deletionDate),
      Origin: "AWS_KMS",
      KeyManager: key.keyManager,
      KeySpec: keySpec.name,
      CustomerMasterKeySpec: keySpec.name,
      EncryptionAlgorithms: this.listed(keySpec.encryptionAlgorithms),
      SigningAlgorithms: this.listed(keySpec.signingAlgorithmNames()),
      MultiRegion: false,
    };
  }

  /**
   * An algorithm list, or nothing at all where the key has none.
   *
   * Real KMS omits the list that does not apply rather than returning it
   * empty, so an encryption key reports no SigningAlgorithms and a signing key
   * reports no EncryptionAlgorithms.
   */
  private listed(algorithms: readonly string[]): readonly string[] | undefined {
    if (algorithms.length === 0) {
      return undefined;
    }

    return algorithms;
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
