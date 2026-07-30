import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCognitoIdentityProvider } from "../../sim-cognito-identity-provider.js";
import type { SimCognitoUserPoolClient } from "../../user-pool/client/sim-cognito-user-pool-client.js";
import { SimCfnCognitoClientProperties } from "./sim-cfn-cognito-client-properties.js";

interface SimCfnCognitoClientCreatorProperties {
  readonly cognito: SimCognitoIdentityProvider;
}

/**
 * Creates simulated app clients from AWS::Cognito::UserPoolClient Resources.
 *
 * The client goes through the ordinary CreateUserPoolClient command, so a
 * template gets the same validation an SDK caller would: the authentication
 * flow names are checked, a secret is generated only when the template asks
 * for one, and a pool that does not exist is refused.
 */
export class SimCfnCognitoClientCreator {
  private readonly cognito: SimCognitoIdentityProvider;

  constructor(properties: SimCfnCognitoClientCreatorProperties) {
    this.cognito = properties.cognito;
  }

  /**
   * Create an app client from an AWS::Cognito::UserPoolClient Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimCognitoUserPoolClient> {
    const clientProperties = new SimCfnCognitoClientProperties({
      resource,
      properties,
    });

    const created = await this.cognito.createUserPoolClient({
      input: clientProperties.createUserPoolClientInput(),
    });

    const clientId = created.UserPoolClient?.ClientId;
    assertDefined(
      clientId,
      `sim Cognito app client id after CloudFormation creation for ${resource.logicalId}`,
    );

    const client = this.cognito
      .userPool(clientProperties.userPoolId())
      .findClient(clientId);
    assertDefined(
      client,
      `sim Cognito app client ${clientId} after CloudFormation creation`,
    );

    return client;
  }
}
