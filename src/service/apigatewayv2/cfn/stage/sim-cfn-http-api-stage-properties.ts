import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCreateStageCommandInput } from "../../command/stage/stage.command.js";
import { SimCfnApiGatewayV2PropertyParser } from "../sim-cfn-api-gateway-v2-property-parser.js";
import { SimCfnHttpApiRouteSettingsProperties } from "./sim-cfn-http-api-route-settings-properties.js";

/**
 * The AWS::ApiGatewayV2::Stage properties this simulation deploys.
 *
 * `DeploymentId`, `AccessLogSettings` and `Tags` are left out, so a template
 * carrying one is recorded and the stage is created without it. None of them
 * is modelled, and a stage that looked logged to the template and logged
 * nothing when serving is the failure worth recording.
 */
const simulatedProperties = [
  "ApiId",
  "StageName",
  "AutoDeploy",
  "StageVariables",
  "Description",
  "DefaultRouteSettings",
  "RouteSettings",
];

interface SimCfnHttpApiStagePropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::ApiGatewayV2::Stage CloudFormation properties into the CreateStage
 * input the stage creator needs.
 */
export class SimCfnHttpApiStageProperties {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly propertyParser = new SimCfnApiGatewayV2PropertyParser({
    resourceType: "AWS::ApiGatewayV2::Stage",
    simulated: simulatedProperties,
  });

  private readonly routeSettingsParser: SimCfnHttpApiRouteSettingsProperties;

  constructor(properties: SimCfnHttpApiStagePropertiesProperties) {
    this.resource = properties.resource;
    this.properties = properties.properties;
    this.routeSettingsParser = new SimCfnHttpApiRouteSettingsProperties({
      resource: this.resource,
      propertyParser: this.propertyParser,
    });

    this.propertyParser.ignoreUnsimulated(this.resource, this.properties);
  }

  /**
   * The API this stage belongs to, which a template reaches with a `Ref` on
   * its AWS::ApiGatewayV2::Api.
   */
  apiId(): string {
    return this.propertyParser.requiredString(
      this.resource,
      this.properties["ApiId"],
      "ApiId",
    );
  }

  /**
   * The stage's name, which is also what a `Ref` on this Resource returns.
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
   * `AutoDeploy` is passed through as the template wrote it, so a stage that
   * does not deploy itself is refused by CreateStage with the reason it is
   * refused. The route settings arrive holding only their throttling members.
   * The ones CreateStage would refuse never reach it from a template.
   */
  createStageInput(): SimCreateStageCommandInput {
    return {
      ApiId: this.apiId(),
      StageName: this.stageName(),
      AutoDeploy: this.propertyParser.optionalBoolean(
        this.resource,
        this.properties["AutoDeploy"],
        "AutoDeploy",
      ),
      StageVariables: this.propertyParser.optionalStringMap(
        this.resource,
        this.properties["StageVariables"],
        "StageVariables",
      ),
      Description: this.propertyParser.optionalString(
        this.resource,
        this.properties["Description"],
        "Description",
      ),
      DefaultRouteSettings: this.routeSettingsParser.settings(
        this.properties["DefaultRouteSettings"],
        "DefaultRouteSettings",
      ),
      RouteSettings: this.routeSettingsParser.settingsMap(
        this.properties["RouteSettings"],
        "RouteSettings",
      ),
    };
  }
}
