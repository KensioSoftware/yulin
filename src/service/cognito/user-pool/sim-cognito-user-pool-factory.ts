import type { SimClock } from "../../../util/clock/sim-clock.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import {
  SimCognitoAdminCreateUserConfig,
  type SimCognitoAdminCreateUserConfigType,
} from "./sim-cognito-admin-create-user-config.js";
import { SimCognitoAutoVerifiedAttributes } from "./sim-cognito-auto-verified-attributes.js";
import { SimCognitoDeletionProtection } from "./sim-cognito-deletion-protection.js";
import { SimCognitoName } from "./sim-cognito-name.js";
import {
  SimCognitoPasswordPolicy,
  type SimCognitoUserPoolPoliciesType,
} from "./sim-cognito-password-policy.js";
import { SimCognitoUserPool } from "./sim-cognito-user-pool.js";
import { SimCognitoUserPoolArn } from "./sim-cognito-user-pool-arn.js";
import { makeSimCognitoUserPoolId } from "./sim-cognito-user-pool-id.js";
import {
  SimCognitoUnsimulatedPoolSettings,
  type SimCognitoUnsimulatedPoolSettingsType,
} from "./sim-cognito-unsimulated-pool-settings.js";
import type { SimCognitoUserPoolStore } from "./sim-cognito-user-pool-store.js";
import { SimCognitoLambdaConfig } from "./trigger/sim-cognito-lambda-config.js";

interface SimCognitoUserPoolFactoryProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly pools: SimCognitoUserPoolStore;
  readonly clock: SimClock;
}

interface SimCognitoMakeUserPoolProperties {
  readonly name: string | undefined;
  readonly policies?: SimCognitoUserPoolPoliciesType | undefined;
  readonly deletionProtection?: string | undefined;
  readonly adminCreateUserConfig?:
    SimCognitoAdminCreateUserConfigType | undefined;
  readonly autoVerifiedAttributes?: readonly string[] | undefined;

  /**
   * The Lambda triggers the request asked the pool to run.
   */
  readonly lambdaConfig?: object | undefined;

  /**
   * The settings the request set that this simulation accepts without acting
   * on, which a described pool reports back.
   */
  readonly unsimulatedSettings?:
    SimCognitoUnsimulatedPoolSettingsType | undefined;
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
      passwordPolicy: new SimCognitoPasswordPolicy(
        properties.policies?.PasswordPolicy,
      ),
      deletionProtection: new SimCognitoDeletionProtection(
        properties.deletionProtection,
      ),
      adminCreateUserConfig: new SimCognitoAdminCreateUserConfig(
        properties.adminCreateUserConfig,
      ),
      autoVerifiedAttributes: new SimCognitoAutoVerifiedAttributes(
        properties.autoVerifiedAttributes,
      ),
      lambdaConfig: new SimCognitoLambdaConfig(properties.lambdaConfig),
      unsimulatedSettings: new SimCognitoUnsimulatedPoolSettings(
        properties.unsimulatedSettings ?? {},
      ),
      createdDate: this.clock.now(),
    });
  }
}
