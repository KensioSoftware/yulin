import type { SimClock } from "../../../util/clock/sim-clock.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { SimCognitoName } from "./sim-cognito-name.js";
import { SimCognitoUserPool } from "./sim-cognito-user-pool.js";
import { SimCognitoUserPoolArn } from "./sim-cognito-user-pool-arn.js";
import { makeSimCognitoUserPoolId } from "./sim-cognito-user-pool-id.js";
import {
  SimCognitoUserPoolSettings,
  type SimCognitoUserPoolSettingsInput,
} from "./sim-cognito-user-pool-settings.js";
import type { SimCognitoUserPoolStore } from "./sim-cognito-user-pool-store.js";

interface SimCognitoUserPoolFactoryProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly pools: SimCognitoUserPoolStore;
  readonly clock: SimClock;
}

interface SimCognitoMakeUserPoolProperties {
  readonly name: string | undefined;

  /**
   * The `CreateUserPool` request the pool's settings are read out of.
   */
  readonly settings: SimCognitoUserPoolSettingsInput;
}

/**
 * Builds simulated user pools, including their id, ARN and defaults.
 *
 * Creation has to produce an id carrying the region, an ARN built from that
 * id, a validated name and the password policy defaults, so it happens in one
 * place rather than at each call site that needs a pool.
 */
export class SimCognitoUserPoolFactory {
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly pools: SimCognitoUserPoolStore;
  private readonly clock: SimClock;

  constructor(properties: SimCognitoUserPoolFactoryProperties) {
    this.accountRegionScope = properties.accountRegionScope;
    this.pools = properties.pools;
    this.clock = properties.clock;
  }

  /**
   * Make a new pool with no app clients yet.
   */
  make(properties: SimCognitoMakeUserPoolProperties): SimCognitoUserPool {
    const userPoolId = makeSimCognitoUserPoolId(
      this.accountRegionScope.regionName,
      this.pools.ids,
    );

    return new SimCognitoUserPool({
      id: userPoolId,
      arn: new SimCognitoUserPoolArn({
        userPoolId,
        accountRegionScope: this.accountRegionScope,
      }),
      name: new SimCognitoName({
        field: "PoolName",
        value: properties.name,
      }),
      settings: new SimCognitoUserPoolSettings({
        input: properties.settings,
        operation: "CreateUserPool",
      }),
      clock: this.clock,
    });
  }
}
