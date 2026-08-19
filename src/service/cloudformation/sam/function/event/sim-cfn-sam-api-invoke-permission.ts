import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../template/value/sim-cfn-template-value.js";
import type { SamFunctionEvent } from "./sim-cfn-sam-function-events.js";

interface SamApiInvokePermissionProperties {
  readonly event: SamFunctionEvent;
  /** The API the permission is granted to, as the expanded Resources name it. */
  readonly apiId: SimCfnTemplateValue;
  /**
   * What the source ARN wildcards after the API's id. An HTTP API addresses a
   * request by stage and route, and a REST API by stage, method and resource
   * path, so the two grants are a segment apart.
   */
  readonly sourceArnSuffix: string;
}

/**
 * The AWS::Lambda::Permission an API invokes the function under.
 *
 * A Lambda proxy integration works only once the function's resource policy
 * admits API Gateway. Without this the route answers 500.
 *
 * The source ARN wildcards everything under the API, the grant SAM writes.
 * Every request this API sends the function is one an event of its own asked
 * for.
 */
export function samApiInvokePermissionResource(
  properties: SamApiInvokePermissionProperties,
): SimCfnTemplateValueRecord {
  const { event, apiId, sourceArnSuffix } = properties;

  return {
    Type: "AWS::Lambda::Permission",
    ...event.condition,
    Properties: {
      Action: "lambda:InvokeFunction",
      FunctionName: { "Fn::GetAtt": [event.functionLogicalId, "Arn"] },
      Principal: "apigateway.amazonaws.com",
      SourceArn: {
        "Fn::Join": [
          "",
          [
            "arn:",
            { Ref: "AWS::Partition" },
            ":execute-api:",
            { Ref: "AWS::Region" },
            ":",
            { Ref: "AWS::AccountId" },
            ":",
            apiId,
            sourceArnSuffix,
          ],
        ],
      },
    },
  };
}
