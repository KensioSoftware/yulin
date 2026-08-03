import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCreateApiCommandInput } from "../../command/api/api.command.js";
import { SimCfnApiGatewayV2PropertyParser } from "../sim-cfn-api-gateway-v2-property-parser.js";

/**
 * The AWS::ApiGatewayV2::Api properties this simulation deploys.
 *
 * `Body`, `BodyS3Location`, `CorsConfiguration`, `Tags`, and the
 * `Target`/`RouteKey` quick-create shorthand are all left out, so a template
 * carrying one is refused by name. Each of them changes what the API serves,
 * and none of them is modelled.
 */
const simulatedProperties = [
  "Name",
  "ProtocolType",
  "Description",
  "DisableExecuteApiEndpoint",
];

interface SimCfnHttpApiPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::ApiGatewayV2::Api CloudFormation properties into the CreateApi
 * input the API creator needs.
 */
export class SimCfnHttpApiProperties {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly propertyParser = new SimCfnApiGatewayV2PropertyParser({
    resourceType: "AWS::ApiGatewayV2::Api",
    simulated: simulatedProperties,
  });

  constructor(properties: SimCfnHttpApiPropertiesProperties) {
    this.resource = properties.resource;
    this.properties = properties.properties;

    this.requireNoResourcePolicy();
    this.propertyParser.requireOnlySimulated(this.resource, this.properties);
  }

  /**
   * The CreateApi input this Resource asks for.
   *
   * `ProtocolType` is passed through rather than fixed at `HTTP`, so a
   * WebSocket API is refused by CreateApi with the reason it is refused.
   */
  createApiInput(): SimCreateApiCommandInput {
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

  /**
   * Refuse a `Policy` property with the reason it cannot be deployed.
   *
   * The generic refusal reports a property as not simulated, which reads as a
   * gap that will be filled later. There is no such property on this Resource
   * type: HTTP APIs have no resource policies at all, so the only template
   * carrying one was written for a REST API.
   */
  private requireNoResourcePolicy(): void {
    if (this.properties["Policy"] === undefined) {
      return;
    }

    throw new Error(
      `AWS::ApiGatewayV2::Api ${this.resource.logicalId} property Policy ` +
        `cannot be deployed: an HTTP API has no resource policy, and AWS ` +
        `has no such property on this Resource type. A resource policy is a ` +
        `REST API feature, declared on AWS::ApiGateway::RestApi. Authorize ` +
        `the API's routes with AuthorizationType AWS_IAM instead.`,
    );
  }
}
