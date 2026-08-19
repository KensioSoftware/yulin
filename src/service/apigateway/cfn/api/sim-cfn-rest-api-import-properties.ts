import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimImportRestApiCommandInput } from "../../command/api/rest-api.command.js";
import { SimCfnApiGatewayPropertyParser } from "../sim-cfn-api-gateway-property-parser.js";
import { SimCfnRestApiDocument } from "./sim-cfn-rest-api-document.js";
import { simCfnRestApiSimulatedProperties } from "./sim-cfn-rest-api-property-names.js";
import { SimCfnRestApiPropertyRules } from "./sim-cfn-rest-api-property-rules.js";

interface SimCfnRestApiImportPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads the AWS::ApiGateway::RestApi properties of an API declared as an
 * OpenAPI document into the ImportRestApi input it asks for.
 */
export class SimCfnRestApiImportProperties {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly propertyParser = new SimCfnApiGatewayPropertyParser({
    resourceType: "AWS::ApiGateway::RestApi",
    simulated: simCfnRestApiSimulatedProperties,
  });
  private readonly rules: SimCfnRestApiPropertyRules;

  constructor(properties: SimCfnRestApiImportPropertiesProperties) {
    this.resource = properties.resource;
    this.properties = properties.properties;
    this.rules = new SimCfnRestApiPropertyRules(properties);
  }

  /**
   * The ImportRestApi input this Resource asks for.
   *
   * `Name` is optional alongside a `Body`, which is what AWS documents, since
   * the document's own `info.title` names the API.
   */
  importRestApiInput(): SimImportRestApiCommandInput {
    this.rules.ignoreUnimportableProperties();

    return {
      body: new SimCfnRestApiDocument({
        resource: this.resource,
        properties: this.properties,
        propertyParser: this.propertyParser,
      }).serialised(),
      failOnWarnings: this.propertyParser.optionalBoolean(
        this.resource,
        this.properties["FailOnWarnings"],
        "FailOnWarnings",
      ),
    };
  }
}
