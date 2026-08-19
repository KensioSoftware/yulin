import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCreateStageCommandInput } from "../../command/stage/stage.command.js";
import { SimCfnApiGatewayPropertyParser } from "../sim-cfn-api-gateway-property-parser.js";

/**
 * The AWS::ApiGateway::Stage properties this simulation deploys.
 *
 * `MethodSettings`, `AccessLogSetting`, `CanarySetting`, `CacheClusterEnabled`,
 * `CacheClusterSize`, `ClientCertificateId`, `DocumentationVersion`,
 * `TracingEnabled` and `Tags` are left out, so a template carrying one has it
 * recorded against the Resource. None of them is modelled, and a stage that
 * looked throttled or logged to the template and did neither when serving is
 * the failure worth avoiding.
 */
const simulatedProperties = [
  "RestApiId",
  "DeploymentId",
  "StageName",
  "Description",
  "Variables",
];

interface SimCfnRestApiStagePropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::ApiGateway::Stage CloudFormation properties into the CreateStage
 * input the stage creator needs.
 */
export class SimCfnRestApiStageProperties {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly propertyParser = new SimCfnApiGatewayPropertyParser({
    resourceType: "AWS::ApiGateway::Stage",
    simulated: simulatedProperties,
  });

  constructor(properties: SimCfnRestApiStagePropertiesProperties) {
    this.resource = properties.resource;
    this.properties = properties.properties;

    this.propertyParser.ignoreUnsimulated(this.resource, this.properties);
  }

  /**
   * The API this stage belongs to, which a template reaches with a `Ref` on
   * its AWS::ApiGateway::RestApi.
   */
  restApiId(): string {
    return this.propertyParser.requiredString(
      this.resource,
      this.properties["RestApiId"],
      "RestApiId",
    );
  }

  /**
   * The stage's name, which is also what a `Ref` on this Resource returns and
   * the first path segment of the endpoint it serves on.
   */
  stageName(): string {
    return this.propertyParser.requiredString(
      this.resource,
      this.properties["StageName"],
      "StageName",
    );
  }

  /**
   * The CreateStage input this Resource asks for.
   *
   * `DeploymentId` is the `Ref` to the AWS::ApiGateway::Deployment this stage
   * serves. A deployment id naming nothing on the API is refused by
   * CreateStage, which is what stops a `Ref` to a Resource this simulation
   * skipped from publishing a stage that serves nothing.
   */
  createStageInput(): SimCreateStageCommandInput {
    return {
      restApiId: this.restApiId(),
      stageName: this.stageName(),
      deploymentId: this.propertyParser.requiredString(
        this.resource,
        this.properties["DeploymentId"],
        "DeploymentId",
      ),
      description: this.propertyParser.optionalString(
        this.resource,
        this.properties["Description"],
        "Description",
      ),
      variables: this.propertyParser.optionalStringMap(
        this.resource,
        this.properties["Variables"],
        "Variables",
      ),
    };
  }
}
