import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimImportApiCommandInput } from "../../command/api/api.command.js";
import type { SimCfnApiGatewayV2PropertyParser } from "../sim-cfn-api-gateway-v2-property-parser.js";
import { SimCfnHttpApiDocument } from "./sim-cfn-http-api-document.js";
import type { SimCfnHttpApiPropertyRules } from "./sim-cfn-http-api-property-rules.js";

interface SimCfnHttpApiImportPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
  readonly propertyParser: SimCfnApiGatewayV2PropertyParser;
  readonly rules: SimCfnHttpApiPropertyRules;
}

/**
 * Reads the AWS::ApiGatewayV2::Api properties of an API declared as an OpenAPI
 * document into the ImportApi input it asks for.
 */
export class SimCfnHttpApiImportProperties {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly propertyParser: SimCfnApiGatewayV2PropertyParser;
  private readonly rules: SimCfnHttpApiPropertyRules;

  constructor(properties: SimCfnHttpApiImportPropertiesProperties) {
    this.resource = properties.resource;
    this.properties = properties.properties;
    this.propertyParser = properties.propertyParser;
    this.rules = properties.rules;
  }

  /**
   * The ImportApi input this Resource asks for.
   *
   * `Name` and `ProtocolType` are both optional alongside a `Body`, which is
   * what AWS documents, and a `ProtocolType` that is present has to be `HTTP`.
   */
  importApiInput(): SimImportApiCommandInput {
    this.rules.ignoreUnimportableProperties();
    this.rules.requireHttpProtocolType(
      this.propertyParser.optionalString(
        this.resource,
        this.properties["ProtocolType"],
        "ProtocolType",
      ),
    );

    return {
      Body: new SimCfnHttpApiDocument({
        resource: this.resource,
        properties: this.properties,
        propertyParser: this.propertyParser,
      }).serialised(),
      FailOnWarnings: this.propertyParser.optionalBoolean(
        this.resource,
        this.properties["FailOnWarnings"],
        "FailOnWarnings",
      ),
    };
  }
}
