import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCreateIntegrationCommandInput } from "../../command/integration/integration.command.js";
import { SimCfnApiGatewayV2PropertyParser } from "../sim-cfn-api-gateway-v2-property-parser.js";

/**
 * The AWS::ApiGatewayV2::Integration properties this simulation deploys.
 *
 * `IntegrationMethod`, `ParameterMapping`, `TimeoutInMillis`, `CredentialsArn`
 * and the rest are left out, so a template carrying one is refused by name.
 * Each of them changes what the integration does with a request, and none of
 * them is modelled.
 */
const simulatedProperties = [
  "ApiId",
  "IntegrationType",
  "IntegrationUri",
  "PayloadFormatVersion",
  "Description",
];

interface SimCfnHttpApiIntegrationPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::ApiGatewayV2::Integration CloudFormation properties into the
 * CreateIntegration input the integration creator needs.
 */
export class SimCfnHttpApiIntegrationProperties {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly propertyParser = new SimCfnApiGatewayV2PropertyParser({
    resourceType: "AWS::ApiGatewayV2::Integration",
    simulated: simulatedProperties,
  });

  constructor(properties: SimCfnHttpApiIntegrationPropertiesProperties) {
    this.resource = properties.resource;
    this.properties = properties.properties;

    this.propertyParser.ignoreUnsimulated(this.resource, this.properties);
  }

  /**
   * The API this integration belongs to, which a template reaches with a `Ref`
   * on its AWS::ApiGatewayV2::Api.
   */
  apiId(): string {
    return this.propertyParser.requiredString(
      this.resource,
      this.properties["ApiId"],
      "ApiId",
    );
  }

  /**
   * The CreateIntegration input this Resource asks for.
   *
   * Everything but the API id is passed through as the template wrote it, so
   * an absent, unsimulated integration type, payload format or integration URI
   * is refused by CreateIntegration with the reason it is refused rather than
   * as a shape complaint here. That includes the two URI forms a template may
   * write, which the integration model reads.
   */
  createIntegrationInput(): SimCreateIntegrationCommandInput {
    return {
      ApiId: this.apiId(),
      IntegrationType: this.propertyParser.optionalString(
        this.resource,
        this.properties["IntegrationType"],
        "IntegrationType",
      ),
      IntegrationUri: this.propertyParser.optionalString(
        this.resource,
        this.properties["IntegrationUri"],
        "IntegrationUri",
      ),
      PayloadFormatVersion: this.propertyParser.optionalString(
        this.resource,
        this.properties["PayloadFormatVersion"],
        "PayloadFormatVersion",
      ),
      Description: this.propertyParser.optionalString(
        this.resource,
        this.properties["Description"],
        "Description",
      ),
    };
  }
}
