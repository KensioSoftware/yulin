import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { SimKmsInvalidStateException } from "../error/sim-kms.error.js";
import type { SimKmsCiphertextBlobParts } from "./sim-kms-ciphertext-blob.js";
import type { SimKmsEncryptionContext } from "./sim-kms-encryption-context.js";
import {
  SimKmsKeyLifecycle,
  type SimKmsKeyState,
} from "./sim-kms-key-lifecycle.js";
import type { SimKmsKeyMaterial } from "./sim-kms-key-material.js";
import type { SimKmsKeyPolicy } from "./sim-kms-key-policy.js";

export { SimKmsKeyState } from "./sim-kms-key-lifecycle.js";

/**
 * Who created and controls a key. AWS managed keys are created by a service
 * on first use rather than by the customer, and cannot be deleted.
 */
export const SimKmsKeyManager = {
  Aws: "AWS",
  Customer: "CUSTOMER",
} as const;

export type SimKmsKeyManager =
  (typeof SimKmsKeyManager)[keyof typeof SimKmsKeyManager];

export type SimKmsKeyId = string;

interface SimKmsKeyProperties {
  readonly keyId: SimKmsKeyId;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly material: SimKmsKeyMaterial;
  readonly policy: SimKmsKeyPolicy;
  readonly creationDate: Date;
  readonly description?: string | undefined;
  readonly keyManager?: SimKmsKeyManager | undefined;
}

/**
 * A stored simulated KMS key.
 *
 * The key owns its material, its policy and its lifecycle, because all three
 * live exactly as long as the key does and every cryptographic operation needs
 * to consult all three.
 */
export class SimKmsKey {
  public readonly keyId: SimKmsKeyId;
  public readonly arn: string;
  public readonly creationDate: Date;
  public readonly keyManager: SimKmsKeyManager;
  public readonly policy: SimKmsKeyPolicy;
  public readonly description: string;

  private readonly material: SimKmsKeyMaterial;
  private readonly lifecycle: SimKmsKeyLifecycle;

  constructor(properties: SimKmsKeyProperties) {
    const { accountRegionScope } = properties;

    this.keyId = properties.keyId;
    this.arn = `arn:aws:kms:${accountRegionScope.regionName}:${accountRegionScope.accountId}:key/${properties.keyId}`;
    this.material = properties.material;
    this.policy = properties.policy;
    this.creationDate = properties.creationDate;
    this.description = properties.description ?? "";
    this.keyManager = properties.keyManager ?? SimKmsKeyManager.Customer;
    this.lifecycle = new SimKmsKeyLifecycle(this.arn);
  }

  /**
   * The key's current lifecycle state.
   */
  get keyState(): SimKmsKeyState {
    return this.lifecycle.state;
  }

  /**
   * Whether the key is enabled, as DescribeKey reports it.
   */
  get isEnabled(): boolean {
    return this.lifecycle.isEnabled;
  }

  /**
   * When the key is due to be deleted, if deletion is scheduled.
   */
  get deletionDate(): Date | undefined {
    return this.lifecycle.deletionDate;
  }

  /**
   * Enable the key.
   */
  enable(): void {
    this.lifecycle.enable();
  }

  /**
   * Disable the key, leaving it present but unusable.
   */
  disable(): void {
    this.lifecycle.disable();
  }

  /**
   * Schedule the key for deletion after a recovery window.
   *
   * An AWS managed key is refused. The service that owns it created it and
   * only that service can remove it, so letting a test delete one would let
   * the test pass on something real AWS would not allow. The failure is
   * reported as an invalid state, which is one of the errors real
   * ScheduleKeyDeletion returns, rather than claiming to know exactly which
   * error AWS picks for this case.
   */
  scheduleDeletion(deletionDate: Date): void {
    if (this.keyManager === SimKmsKeyManager.Aws) {
      throw new SimKmsInvalidStateException(
        `Key ${this.arn} is an AWS managed key and cannot be scheduled for deletion`,
      );
    }

    this.lifecycle.scheduleDeletion(deletionDate);
  }

  /**
   * Cancel a scheduled deletion, leaving the key disabled.
   */
  cancelDeletion(): void {
    this.lifecycle.cancelDeletion();
  }

  /**
   * Encrypt plaintext under this key.
   */
  encrypt(
    plaintext: Uint8Array,
    encryptionContext?: SimKmsEncryptionContext,
  ): Uint8Array {
    this.lifecycle.requireUsable();
    return this.material.encrypt(plaintext, encryptionContext);
  }

  /**
   * Decrypt a ciphertext produced under this key.
   */
  decrypt(
    parts: SimKmsCiphertextBlobParts,
    encryptionContext?: SimKmsEncryptionContext,
  ): Uint8Array {
    this.lifecycle.requireUsable();
    return this.material.decrypt(parts, encryptionContext);
  }
}
