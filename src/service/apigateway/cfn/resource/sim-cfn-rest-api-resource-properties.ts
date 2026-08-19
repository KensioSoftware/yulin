import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCreateResourceCommandInput } from "../../command/resource/resource.command.js";
import { SimCfnApiGatewayPropertyParser } from "../sim-cfn-api-gateway-property-parser.js";

/**
 * The AWS::ApiGateway::Resource properties this simulation deploys, which is
 * every property the Resource type has.
 */
const simulatedProperties = ["RestApiId", "ParentId", "PathPart"];

interface SimCfnRestApiResourcePropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::ApiGateway::Resource CloudFormation properties into the
 * CreateResource input the resource creator needs.
 */
export class SimCfnRestApiResourceProperties {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly propertyParser = new SimCfnApiGatewayPropertyParser({
    resourceType: "AWS::ApiGateway::Resource",
    simulated: simulatedProperties,
  });

  constructor(properties: SimCfnRestApiResourcePropertiesProperties) {
    this.resource = properties.resource;
    this.properties = properties.properties;

    this.propertyParser.ignoreUnsimulated(this.resource, this.properties);
  }

  /**
   * The API this node belongs to, which a template reaches with a `Ref` on its
   * AWS::ApiGateway::RestApi.
   */
  restApiId(): string {
    return this.propertyParser.requiredString(
      this.resource,
      this.properties["RestApiId"],
      "RestApiId",
    );
  }

  /**
   * The CreateResource input this Resource asks for.
   *
   * `ParentId` is the root resource id a template reads with
   * `Fn::GetAtt RootResourceId`, or a `Ref` to the resource above this one.
   * A path part real API Gateway refuses is refused by CreateResource with the
   * reason it refuses it.
   */
  createResourceInput(): SimCreateResourceCommandInput {
    return {
      restApiId: this.restApiId(),
      parentId: this.propertyParser.requiredString(
        this.resource,
        this.properties["ParentId"],
        "ParentId",
      ),
      pathPart: this.propertyParser.requiredString(
        this.resource,
        this.properties["PathPart"],
        "PathPart",
      ),
    };
  }
}
