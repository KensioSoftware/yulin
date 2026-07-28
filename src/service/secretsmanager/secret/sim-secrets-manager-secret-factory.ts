import type { SimClock } from "../../../util/clock/sim-clock.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import {
  SimSecretsManagerSecret,
  type SimSecretsManagerTag,
} from "./sim-secrets-manager-secret.js";
import { SimSecretsManagerSecretArn } from "./sim-secrets-manager-secret-arn.js";
import { SimSecretsManagerSecretName } from "./sim-secrets-manager-secret-name.js";

interface SimSecretsManagerSecretFactoryProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly clock: SimClock;
}

interface SimSecretsManagerMakeSecretProperties {
  readonly name: string | undefined;
  readonly description?: string | undefined;
  readonly kmsKeyId?: string | undefined;
  readonly tags?: readonly SimSecretsManagerTag[] | undefined;
}

/**
 * Builds simulated secrets, including their name validation and their ARN.
 *
 * Creation has to produce a validated name, an ARN carrying the random suffix
 * that name gets, and a creation timestamp from the simulation's clock, so it
 * happens in one place rather than at each call site that needs a secret.
 */
export class SimSecretsManagerSecretFactory {
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly clock: SimClock;

  constructor(properties: SimSecretsManagerSecretFactoryProperties) {
    this.accountRegionScope = properties.accountRegionScope;
    this.clock = properties.clock;
  }

  /**
   * Make a new secret with no versions yet.
   */
  make(
    properties: SimSecretsManagerMakeSecretProperties,
  ): SimSecretsManagerSecret {
    const name = new SimSecretsManagerSecretName(properties.name);

    return new SimSecretsManagerSecret({
      arn: new SimSecretsManagerSecretArn({
        name: name.value,
        accountRegionScope: this.accountRegionScope,
      }),
      createdDate: this.clock.now(),
      description: properties.description,
      kmsKeyId: properties.kmsKeyId,
      tags: properties.tags,
    });
  }
}
