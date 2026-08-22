import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCreateStageCommandInput } from "../../command/stage/stage.command.js";
import { SimCfnApiGatewayPropertyParser } from "../sim-cfn-api-gateway-property-parser.js";
import { SimCfnRestApiMethodSettingsProperties } from "./sim-cfn-rest-api-method-settings-properties.js";

/**
 * The AWS::ApiGateway::Stage properties this simulation deploys.
 *
 * `AccessLogSetting`, `CanarySetting`, `CacheClusterEnabled`,
 * `CacheClusterSize`, `ClientCertificateId`, `DocumentationVersion`,
 * `TracingEnabled` and `Tags` are left out, so a template carrying one has it
 * recorded against the Resource. None of them is modelled, and a stage that
 * looked logged to the template and logged nothing when serving is the failure
 * worth recording.
 */
const simulatedProperties = [
  "RestApiId",
  "DeploymentId",
  "StageName",
  "Description",
  "Variables",
  "MethodSettings",
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

  private readonly methodSettingsParser: SimCfnRestApiMethodSettingsProperties;

  constructor(properties: SimCfnRestApiStagePropertiesProperties) {
    this.resource = properties.resource;
    this.properties = properties.properties;
    this.methodSettingsParser = new SimCfnRestApiMethodSettingsProperties({
      resource: this.resource,
    });

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
   * skipped from publishing a stage that serves nothing. `MethodSettings`
   * arrives holding only its throttling members, so the ones CreateStage would
   * refuse never reach it from a template.
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
      methodSettings: this.methodSettingsParser.methodSettings(
        this.properties["MethodSettings"],
        "MethodSettings",
      ),
    };
  }
}
