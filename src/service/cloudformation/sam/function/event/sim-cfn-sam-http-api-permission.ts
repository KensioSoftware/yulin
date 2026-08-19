import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../template/value/sim-cfn-template-value.js";
import type { SamFunctionEvent } from "./sim-cfn-sam-function-events.js";

/**
 * The AWS::Lambda::Permission the API invokes the function under.
 *
 * A Lambda proxy integration works only once the function's resource policy
 * admits API Gateway. Without this the route answers 500.
 *
 * The source ARN wildcards the stage and the route, the grant SAM writes.
 * Every route this API sends the function is one an event of its own asked
 * for.
 */
export function samHttpApiPermissionResource(
  event: SamFunctionEvent,
  apiId: SimCfnTemplateValue,
): SimCfnTemplateValueRecord {
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
            "/*/*",
          ],
        ],
      },
    },
  };
}
