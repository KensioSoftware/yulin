import { createHash } from "node:crypto";

import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../template/value/sim-cfn-template-value.js";
import { samPickedProperties } from "../sim-cfn-sam-picked.js";

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
      ...samStageCondition(resource),
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
 * The three forms are SAM's own. A name that can be part of an identifier goes
 * in whole, `$default` becomes the suffix SAM spells out, and anything else is
 * hashed, down to the ten hexadecimal characters SAM takes off a SHA-1 of the
 * name. A stage the template names with an intrinsic function has no name to
 * hash at this point, and SAM hashes the empty string for it.
 */
function samHttpApiStageLogicalId(
  logicalId: string,
  stageName: SimCfnTemplateValue,
): string {
  if (stageName === defaultStageName) {
    return `${logicalId}ApiGatewayDefaultStage`;
  }

  if (typeof stageName === "string" && /^[A-Za-z0-9]+$/.test(stageName)) {
    return `${logicalId}${stageName}Stage`;
  }

  return `${logicalId}Stage${samStageNameHash(stageName)}`;
}

/**
 * The hash SAM builds a stage's logical ID out of when the name cannot be part
 * of one.
 */
function samStageNameHash(stageName: SimCfnTemplateValue): string {
  const name = typeof stageName === "string" ? stageName : "";

  return createHash("sha1").update(name).digest("hex").slice(0, 10);
}

/**
 * The `Condition` attribute the stage carries, where the API carried one.
 */
function samStageCondition(
  resource: SimCfnTemplateValueRecord,
): SimCfnTemplateValueRecord {
  const condition = resource["Condition"];

  return condition === undefined ? {} : { Condition: condition };
}
