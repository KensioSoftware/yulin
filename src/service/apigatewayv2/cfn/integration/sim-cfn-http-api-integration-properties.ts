import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCreateIntegrationCommandInput } from "../../command/integration/integration.command.js";
import { SimCfnApiGatewayV2PropertyParser } from "../sim-cfn-api-gateway-v2-property-parser.js";
import { simCfnHttpApiIntegrationUri } from "./sim-cfn-http-api-integration-uri.js";

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

    this.propertyParser.requireOnlySimulated(this.resource, this.properties);
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
   * an absent, unsimulated integration type or payload format is refused by
   * CreateIntegration with the reason it is refused rather than as a shape
   * complaint here.
   */
  createIntegrationInput(): SimCreateIntegrationCommandInput {
    return {
      ApiId: this.apiId(),
      IntegrationType: this.propertyParser.optionalString(
        this.resource,
        this.properties["IntegrationType"],
        "IntegrationType",
      ),
      IntegrationUri: this.integrationUri(),
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

  /**
   * The Lambda function ARN this integration invokes, read from either URI
   * form a template may write.
   */
  private integrationUri(): string | undefined {
    const uri = this.propertyParser.optionalString(
      this.resource,
      this.properties["IntegrationUri"],
      "IntegrationUri",
    );

    if (uri === undefined) {
      return undefined;
    }

    return simCfnHttpApiIntegrationUri(uri);
  }
}
