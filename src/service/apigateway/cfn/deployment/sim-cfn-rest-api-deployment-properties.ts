import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCreateDeploymentCommandInput } from "../../command/stage/stage.command.js";
import { SimCfnApiGatewayPropertyParser } from "../sim-cfn-api-gateway-property-parser.js";

/**
 * The AWS::ApiGateway::Deployment properties this simulation deploys.
 *
 * `StageDescription` and `DeploymentCanarySettings` are left out, so a
 * template carrying one has it recorded against the Resource. `StageName` is
 * the older one-Resource form, where the deployment publishes a stage of its
 * own instead of an AWS::ApiGateway::Stage naming it.
 */
const simulatedProperties = ["RestApiId", "Description", "StageName"];

interface SimCfnRestApiDeploymentPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::ApiGateway::Deployment CloudFormation properties into the
 * CreateDeployment input the deployment creator needs.
 */
export class SimCfnRestApiDeploymentProperties {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly propertyParser = new SimCfnApiGatewayPropertyParser({
    resourceType: "AWS::ApiGateway::Deployment",
    simulated: simulatedProperties,
  });

  constructor(properties: SimCfnRestApiDeploymentPropertiesProperties) {
    this.resource = properties.resource;
    this.properties = properties.properties;

    this.propertyParser.ignoreUnsimulated(this.resource, this.properties);
  }

  /**
   * The API this deployment belongs to, which a template reaches with a `Ref`
   * on its AWS::ApiGateway::RestApi.
   */
  restApiId(): string {
    return this.propertyParser.requiredString(
      this.resource,
      this.properties["RestApiId"],
      "RestApiId",
    );
  }

  /**
   * The CreateDeployment input this Resource asks for.
   */
  createDeploymentInput(): SimCreateDeploymentCommandInput {
    return {
      restApiId: this.restApiId(),
      stageName: this.propertyParser.optionalString(
        this.resource,
        this.properties["StageName"],
        "StageName",
      ),
      description: this.propertyParser.optionalString(
        this.resource,
        this.properties["Description"],
        "Description",
      ),
    };
  }
}
