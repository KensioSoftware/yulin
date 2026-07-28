import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimSecretsManagerSecret } from "./sim-secrets-manager-secret.js";
import type { SimSecretsManagerSecretStore } from "./sim-secrets-manager-secret-store.js";

interface SimSecretsManagerSecretExpiryProperties {
  readonly secrets: SimSecretsManagerSecretStore;
  readonly background: BackgroundScheduler;
}

/**
 * Removes a secret once its recovery window runs out.
 *
 * The window is scheduled on the simulation's clock rather than the host's, so
 * advancing simulated time past it is what frees the name up again. That is
 * the failure people actually hit when a stack is deleted and redeployed, and
 * it is only testable if the window really elapses.
 */
export class SimSecretsManagerSecretExpiry {
  private readonly secrets: SimSecretsManagerSecretStore;
  private readonly background: BackgroundScheduler;

  constructor(properties: SimSecretsManagerSecretExpiryProperties) {
    this.secrets = properties.secrets;
    this.background = properties.background;
  }

  /**
   * Arrange for a secret to be gone once its deletion date arrives.
   *
   * The scheduled work checks the secret is still due to go at that same
   * instant, so a RestoreSecret in the meantime, or a second deletion with a
   * different window, leaves the earlier schedule with nothing to do.
   */
  scheduleRemoval(secret: SimSecretsManagerSecret, deletionDate: Date): void {
    this.background.scheduleAt(deletionDate, (): Promise<void> => {
      if (secret.deletionDate?.getTime() === deletionDate.getTime()) {
        this.secrets.remove(secret);
      }

      return Promise.resolve();
    });
  }
}
