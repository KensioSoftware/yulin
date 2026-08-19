import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCreateRestApiCommandInput } from "../../command/api/rest-api.command.js";
import { SimCfnApiGatewayPropertyParser } from "../sim-cfn-api-gateway-property-parser.js";

/**
 * The AWS::ApiGateway::RestApi properties this simulation deploys.
 *
 * `Body`, `BodyS3Location`, `Mode`, `EndpointConfiguration`, `Policy`,
 * `BinaryMediaTypes`, `MinimumCompressionSize`, `ApiKeySourceType`,
 * `Parameters`, `CloneFrom`, `FailOnWarnings` and `Tags` are all left out, so
 * a template carrying one has it recorded against the Resource. The API is
 * created without it.
 */
const simulatedProperties = [
  "Name",
  "Description",
  "DisableExecuteApiEndpoint",
];

interface SimCfnRestApiPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::ApiGateway::RestApi CloudFormation properties into the
 * CreateRestApi input the API creator needs.
 *
 * A `Body` is an OpenAPI document declaring the API's resources, methods and
 * integrations. Nothing here reads one, so an API declared that way deploys
 * with a root resource and nothing under it, and the record says so.
 */
export class SimCfnRestApiProperties {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly propertyParser = new SimCfnApiGatewayPropertyParser({
    resourceType: "AWS::ApiGateway::RestApi",
    simulated: simulatedProperties,
  });

  constructor(properties: SimCfnRestApiPropertiesProperties) {
    this.resource = properties.resource;
    this.properties = properties.properties;

    this.propertyParser.ignoreUnsimulated(this.resource, this.properties);
  }

  /**
   * The CreateRestApi input this Resource asks for.
   */
  createRestApiInput(): SimCreateRestApiCommandInput {
    return {
      name: this.propertyParser.requiredString(
        this.resource,
        this.properties["Name"],
        "Name",
      ),
      description: this.propertyParser.optionalString(
        this.resource,
        this.properties["Description"],
        "Description",
      ),
      disableExecuteApiEndpoint: this.propertyParser.optionalBoolean(
        this.resource,
        this.properties["DisableExecuteApiEndpoint"],
        "DisableExecuteApiEndpoint",
      ),
    };
  }
}
