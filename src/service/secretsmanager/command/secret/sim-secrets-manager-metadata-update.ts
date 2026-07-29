import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimSecretsManagerSecret } from "../../secret/sim-secrets-manager-secret.js";
import type { SimUpdateSecretCommandInput } from "./secret.command.js";

interface SimSecretsManagerMetadataUpdateProperties {
  readonly clock: SimClock;
}

/**
 * Applies the metadata fields an UpdateSecret request carries.
 *
 * Omitting a field leaves it as it was, which is how real Secrets Manager
 * treats an absent Description or KmsKeyId. A new KmsKeyId applies to versions
 * written afterwards; the ones already written keep the key they were made
 * with and stay readable.
 */
export class SimSecretsManagerMetadataUpdate {
  private readonly clock: SimClock;

  constructor(properties: SimSecretsManagerMetadataUpdateProperties) {
    this.clock = properties.clock;
  }

  /**
   * Apply a request's metadata to the secret.
   */
  apply(
    secret: SimSecretsManagerSecret,
    input: SimUpdateSecretCommandInput,
  ): void {
    if (input.Description !== undefined) {
      secret.description = input.Description;
    }

    if (input.KmsKeyId !== undefined) {
      secret.kmsKeyId = input.KmsKeyId;
    }

    secret.lastChangedDate = this.clock.now();
  }
}
