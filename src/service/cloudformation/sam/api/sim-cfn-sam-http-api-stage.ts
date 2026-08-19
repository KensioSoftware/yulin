import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../template/value/sim-cfn-template-value.js";
import { samConditionAttribute } from "../function/sim-cfn-sam-function-properties.js";
import { samPickedProperties } from "../sim-cfn-sam-picked.js";
import { samStageLogicalId } from "./sim-cfn-sam-stage-logical-id.js";

interface SamHttpApiStageProperties {
  readonly logicalId: string;
  readonly resource: SimCfnTemplateValueRecord;
  readonly apiProperties: SimCfnTemplateValueRecord;
}

/**
 * The stage an API naming none is deployed with. SAM deploys the same one, and
 * a request reaches it without naming a stage in its path.
 */
const defaultStageName = "$default";

/**
 * The properties the stage takes off the SAM Resource. Their names and
 * meanings are the same on both.
 */
const propertyNames = new Set([
  "AccessLogSettings",
  "DefaultRouteSettings",
  "RouteSettings",
  "StageVariables",
  "Tags",
]);

/**
 * The AWS::ApiGatewayV2::Stage Resource a SAM HTTP API is expanded with.
 *
 * An HTTP API serves nothing until a stage is deployed to it, and a SAM
 * template names no stage Resource of its own. The expansion deploys one. It
 * deploys itself, the way SAM's stage does, and the routes the API gains after
 * it are served with no deployment Resource to sequence.
 *
 * The stage is conditioned the way the API is. An API the template conditioned
 * out leaves no stage behind for the Stack to create.
 */
export function samHttpApiStageResources(
  properties: SamHttpApiStageProperties,
): Record<string, SimCfnTemplateValue> {
  const { logicalId, resource, apiProperties } = properties;
  const stageName = apiProperties["StageName"] ?? defaultStageName;

  return {
    [samHttpApiStageLogicalId(logicalId, stageName)]: {
      Type: "AWS::ApiGatewayV2::Stage",
      ...samConditionAttribute(resource["Condition"]),
      Properties: {
        ...samPickedProperties(apiProperties, propertyNames),
        ApiId: { Ref: logicalId },
        StageName: stageName,
        AutoDeploy: true,
      },
    },
  };
}

/**
 * The logical ID the stage is deployed under, which SAM builds out of the API's
 * logical ID and the stage's name.
 *
 * `$default` becomes the suffix SAM spells out for it, and every other name
 * takes the form both API kinds share.
 */
function samHttpApiStageLogicalId(
  logicalId: string,
  stageName: SimCfnTemplateValue,
): string {
  if (stageName === defaultStageName) {
    return `${logicalId}ApiGatewayDefaultStage`;
  }

  return samStageLogicalId(logicalId, stageName);
}
