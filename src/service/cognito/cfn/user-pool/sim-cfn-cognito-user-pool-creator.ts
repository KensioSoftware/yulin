import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCognitoIdentityProvider } from "../../sim-cognito-identity-provider.js";
import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";
import { SimCfnCognitoUserPoolProperties } from "./sim-cfn-cognito-user-pool-properties.js";

interface SimCfnCognitoUserPoolCreatorProperties {
  readonly cognito: SimCognitoIdentityProvider;
}

/**
 * Creates simulated user pools from AWS::Cognito::UserPool Resources.
 *
 * The pool is created through the ordinary CreateUserPool command rather than
 * constructed directly, so a pool a template deployed is the same thing an SDK
 * caller would have got: an id in the real form, the real password policy
 * defaults, and the same refusal of the pool features this simulation does not
 * model.
 */
export class SimCfnCognitoUserPoolCreator {
  private readonly cognito: SimCognitoIdentityProvider;

  constructor(properties: SimCfnCognitoUserPoolCreatorProperties) {
    this.cognito = properties.cognito;
  }

  /**
   * Create a user pool from an AWS::Cognito::UserPool Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimCognitoUserPool> {
    const poolProperties = new SimCfnCognitoUserPoolProperties({
      resource,
      properties,
    });

    const created = await this.cognito.createUserPool({
      input: poolProperties.createUserPoolInput(),
    });

    const userPoolId = created.UserPool?.Id;
    assertDefined(
      userPoolId,
      `sim Cognito user pool id after CloudFormation creation for ${resource.logicalId}`,
    );

    await this.setMfaConfig(poolProperties, userPoolId);

    return this.cognito.userPool(userPoolId);
  }

  /**
   * Configure the pool's MFA, where the template asked for any.
   *
   * This is the second call real CloudFormation makes for a pool declaring
   * `MfaConfiguration` or `EnabledMfas`, rather than a property of the
   * creation, so a stack that deploys here needs the same
   * `cognito-idp:SetUserPoolMfaConfig` permission it needs on real AWS.
   */
  private async setMfaConfig(
    poolProperties: SimCfnCognitoUserPoolProperties,
    userPoolId: string,
  ): Promise<void> {
    const input = poolProperties.setUserPoolMfaConfigInput(userPoolId);

    if (input === undefined) {
      return;
    }

    await this.cognito.setUserPoolMfaConfig({ input });
  }
}
