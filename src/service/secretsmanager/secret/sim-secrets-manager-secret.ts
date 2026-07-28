import { SimSecretsManagerInvalidRequestException } from "../error/sim-secrets-manager.error.js";
import type { SimSecretsManagerSecretArn } from "./sim-secrets-manager-secret-arn.js";
import { SimSecretsManagerSecretVersions } from "./sim-secrets-manager-secret-versions.js";

/**
 * A tag on a simulated secret, in the shape the SDK carries it.
 */
export interface SimSecretsManagerTag {
  readonly Key?: string | undefined;
  readonly Value?: string | undefined;
}

interface SimSecretsManagerSecretProperties {
  readonly arn: SimSecretsManagerSecretArn;
  readonly createdDate: Date;
  readonly description?: string | undefined;
  readonly kmsKeyId?: string | undefined;
  readonly tags?: readonly SimSecretsManagerTag[] | undefined;
}

/**
 * One stored simulated secret: its identity, its metadata and its versions.
 *
 * Deletion state lives here rather than in the store because it is the secret
 * that behaves differently once it is scheduled: it can still be described and
 * restored, but it refuses to be read or written.
 */
export class SimSecretsManagerSecret {
  public readonly arn: SimSecretsManagerSecretArn;
  public readonly createdDate: Date;
  public readonly versions = new SimSecretsManagerSecretVersions();

  public description: string | undefined;

  /**
   * The KMS key the secret says it is encrypted under.
   *
   * Nothing is actually encrypted with it and no kms:Decrypt check happens, so
   * this is looser than real AWS. Simulated KMS is not wired into this service
   * yet; the value is stored and reported so that code reading it behaves the
   * same, and the divergence is documented.
   */
  public kmsKeyId: string | undefined;

  public tags: readonly SimSecretsManagerTag[];
  public lastChangedDate: Date;

  private scheduledDeletionDate: Date | undefined;

  constructor(properties: SimSecretsManagerSecretProperties) {
    this.arn = properties.arn;
    this.createdDate = properties.createdDate;
    this.lastChangedDate = properties.createdDate;
    this.description = properties.description;
    this.kmsKeyId = properties.kmsKeyId;
    this.tags = properties.tags ?? [];
  }

  /**
   * The friendly name of the secret, without the ARN suffix.
   */
  get name(): string {
    return this.arn.name;
  }

  /**
   * When the secret is due to be deleted for good, if deletion is scheduled.
   */
  get deletionDate(): Date | undefined {
    return this.scheduledDeletionDate;
  }

  /**
   * Whether the secret is waiting out its recovery window.
   */
  get isScheduledForDeletion(): boolean {
    return this.scheduledDeletionDate !== undefined;
  }

  /**
   * Schedule the secret for deletion after a recovery window.
   */
  scheduleDeletion(deletionDate: Date): void {
    if (this.scheduledDeletionDate !== undefined) {
      throw new SimSecretsManagerInvalidRequestException(
        `Secret ${this.arn.value} is already scheduled for deletion`,
      );
    }

    this.scheduledDeletionDate = deletionDate;
  }

  /**
   * Cancel a scheduled deletion.
   *
   * Real Secrets Manager accepts this whether or not the secret was scheduled,
   * so a restore of a live secret is a no-op rather than a failure.
   */
  cancelDeletion(): void {
    this.scheduledDeletionDate = undefined;
  }

  /**
   * Refuse an operation that a scheduled secret cannot serve.
   *
   * Real Secrets Manager keeps a scheduled secret describable and restorable
   * while refusing to read or write its value, which is what makes the
   * recovery window a recovery window.
   */
  requireNotScheduledForDeletion(): void {
    if (this.scheduledDeletionDate === undefined) {
      return;
    }

    throw new SimSecretsManagerInvalidRequestException(
      `Secret ${this.arn.value} is scheduled for deletion and cannot be used. ` +
        `Restore it with RestoreSecret first.`,
    );
  }
}
