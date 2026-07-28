import type { SimSecretsManagerSecretValue } from "./sim-secrets-manager-secret-value.js";

/**
 * The staging labels Secrets Manager gives a meaning of its own.
 *
 * Any other label is a custom one, which real Secrets Manager also allows and
 * treats as a plain marker.
 */
export const SimSecretsManagerStagingLabel = {
  Current: "AWSCURRENT",
  Previous: "AWSPREVIOUS",
} as const;

export type SimSecretsManagerStagingLabel =
  (typeof SimSecretsManagerStagingLabel)[keyof typeof SimSecretsManagerStagingLabel];

interface SimSecretsManagerSecretVersionProperties {
  readonly versionId: string;
  readonly value: SimSecretsManagerSecretValue;
  readonly createdDate: Date;
}

/**
 * One stored version of a simulated secret.
 *
 * A version's value never changes once written: real Secrets Manager creates a
 * new version for every write and moves staging labels between them, which is
 * what makes AWSPREVIOUS able to hold the value that was current before.
 */
export class SimSecretsManagerSecretVersion {
  public readonly versionId: string;
  public readonly value: SimSecretsManagerSecretValue;
  public readonly createdDate: Date;

  private readonly labels = new Set<string>();

  constructor(properties: SimSecretsManagerSecretVersionProperties) {
    this.versionId = properties.versionId;
    this.value = properties.value;
    this.createdDate = properties.createdDate;
  }

  /**
   * The staging labels currently attached to this version.
   */
  get stages(): readonly string[] {
    return this.labels.values().toArray();
  }

  /**
   * Whether this version carries any staging label at all.
   *
   * A version that carries none is deprecated on real AWS: it is no longer
   * reported by DescribeSecret, and nothing can reach it by label.
   */
  get isLabelled(): boolean {
    return this.labels.size > 0;
  }

  /**
   * Whether a staging label is attached to this version.
   */
  hasStage(label: string): boolean {
    return this.labels.has(label);
  }

  /**
   * Attach a staging label to this version.
   */
  addStage(label: string): void {
    this.labels.add(label);
  }

  /**
   * Detach a staging label from this version.
   */
  removeStage(label: string): void {
    this.labels.delete(label);
  }
}
