import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimHttpApiIntegration } from "../../api/integration/sim-http-api-integration.js";
import type { SimApiGatewayV2 } from "../../sim-api-gateway-v2.js";
import { SimCfnHttpApiIntegrationProperties } from "./sim-cfn-http-api-integration-properties.js";

interface SimCfnHttpApiIntegrationCreatorProperties {
  readonly apiGatewayV2: SimApiGatewayV2;
}

/**
 * Creates simulated integrations from AWS::ApiGatewayV2::Integration Resources.
 *
 * The integration goes through the ordinary CreateIntegration command, so an
 * unsimulated integration type, payload format or integration URI is refused
 * here with the reason the command gives.
 */
export class SimCfnHttpApiIntegrationCreator {
  private readonly apiGatewayV2: SimApiGatewayV2;

  constructor(properties: SimCfnHttpApiIntegrationCreatorProperties) {
    this.apiGatewayV2 = properties.apiGatewayV2;
  }

  /**
   * Create an integration from an AWS::ApiGatewayV2::Integration Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimHttpApiIntegration> {
    const integrationProperties = new SimCfnHttpApiIntegrationProperties({
      resource,
      properties,
    });
    const apiId = integrationProperties.apiId();

    const created = await this.apiGatewayV2.createIntegration({
      input: integrationProperties.createIntegrationInput(),
    });

    const integration = this.apiGatewayV2
      .findApi(apiId)
      ?.integrations.find(created.IntegrationId);
    assertDefined(
      integration,
      `sim HTTP API integration ${created.IntegrationId} after ` +
        `CloudFormation creation`,
    );

    return integration;
  }
}
