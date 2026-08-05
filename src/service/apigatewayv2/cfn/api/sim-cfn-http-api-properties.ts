import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type {
  SimCreateApiCommandInput,
  SimImportApiCommandInput,
} from "../../command/api/api.command.js";
import { SimCfnApiGatewayV2PropertyParser } from "../sim-cfn-api-gateway-v2-property-parser.js";
import { SimCfnHttpApiImportProperties } from "./sim-cfn-http-api-import-properties.js";
import { SimCfnHttpApiPropertyRules } from "./sim-cfn-http-api-property-rules.js";

/**
 * The AWS::ApiGatewayV2::Api properties this simulation deploys.
 *
 * `BodyS3Location`, `CorsConfiguration`, `Tags`, and the `Target`/`RouteKey`
 * quick-create shorthand are all left out, so a template carrying one is
 * refused by name. Each of them changes what the API serves, and none of them
 * is modelled.
 */
const simulatedProperties = [
  "Name",
  "ProtocolType",
  "Description",
  "DisableExecuteApiEndpoint",
  "Body",
  "FailOnWarnings",
];

interface SimCfnHttpApiPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::ApiGatewayV2::Api CloudFormation properties into the CreateApi or
 * ImportApi input the API creator needs.
 *
 * A `Body` is the whole declaration of an API: its routes, its integrations
 * and its authorizers all come out of the document rather than out of sibling
 * Resources, so that half is read by SimCfnHttpApiImportProperties.
 */
export class SimCfnHttpApiProperties {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly propertyParser = new SimCfnApiGatewayV2PropertyParser({
    resourceType: "AWS::ApiGatewayV2::Api",
    simulated: simulatedProperties,
  });
  private readonly rules: SimCfnHttpApiPropertyRules;

  constructor(properties: SimCfnHttpApiPropertiesProperties) {
    this.resource = properties.resource;
    this.properties = properties.properties;
    this.rules = new SimCfnHttpApiPropertyRules({
      resource: this.resource,
      properties: this.properties,
    });

    this.rules.requireNoResourcePolicy();
    this.propertyParser.ignoreUnsimulated(this.resource, this.properties);
  }

  /**
   * Whether this Resource declares the API as an OpenAPI document.
   */
  imported(): boolean {
    return this.properties["Body"] !== undefined;
  }

  /**
   * The ImportApi input this Resource asks for.
   */
  importApiInput(): SimImportApiCommandInput {
    return new SimCfnHttpApiImportProperties({
      resource: this.resource,
      properties: this.properties,
      propertyParser: this.propertyParser,
      rules: this.rules,
    }).importApiInput();
  }

  /**
   * The CreateApi input this Resource asks for.
   *
   * `ProtocolType` is passed through rather than fixed at `HTTP`, so a
   * WebSocket API is refused by CreateApi with the reason it is refused.
   */
  createApiInput(): SimCreateApiCommandInput {
    this.rules.ignoreFailOnWarningsWithoutBody();

    return {
      Name: this.propertyParser.requiredString(
        this.resource,
        this.properties["Name"],
        "Name",
      ),
      ProtocolType: this.propertyParser.requiredString(
        this.resource,
        this.properties["ProtocolType"],
        "ProtocolType",
      ),
      Description: this.propertyParser.optionalString(
        this.resource,
        this.properties["Description"],
        "Description",
      ),
      DisableExecuteApiEndpoint: this.propertyParser.optionalBoolean(
        this.resource,
        this.properties["DisableExecuteApiEndpoint"],
        "DisableExecuteApiEndpoint",
      ),
    };
  }
}
