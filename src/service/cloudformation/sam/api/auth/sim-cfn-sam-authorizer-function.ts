import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../template/value/sim-cfn-template-value.js";

/**
 * The `AuthorizerUri` an authorizer invokes a function through.
 *
 * API Gateway names the function through its own service path rather than by
 * ARN, and this is the wrapped form both authorizer Resource types take. The
 * function ARN goes in as the template wrote it, which is a `Fn::GetAtt` on a
 * function of the same template more often than not.
 */
export function samAuthorizerUri(
  functionArn: SimCfnTemplateValue,
): SimCfnTemplateValue {
  return {
    "Fn::Join": [
      "",
      [
        "arn:",
        { Ref: "AWS::Partition" },
        ":apigateway:",
        { Ref: "AWS::Region" },
        ":lambda:path/2015-03-31/functions/",
        functionArn,
        "/invocations",
      ],
    ],
  };
}

interface SamAuthorizerPermissionProperties {
  /** The function the authorizer runs, as the template names it. */
  readonly functionArn: SimCfnTemplateValue;
  /** The logical ID of the API whose authorizers the grant covers. */
  readonly apiLogicalId: string;
}

/**
 * The AWS::Lambda::Permission an API invokes its authorizer function under.
 *
 * Without it the authorizer answers nothing and every request the authorizer
 * decides is refused. The source ARN wildcards the authorizers of the one API,
 * because the authorizer's own id is only known once it is created, and a
 * grant naming it would have to be deployed after the thing that needs it.
 */
export function samAuthorizerPermissionResource(
  properties: SamAuthorizerPermissionProperties,
): SimCfnTemplateValueRecord {
  return {
    Type: "AWS::Lambda::Permission",
    Properties: {
      Action: "lambda:InvokeFunction",
      FunctionName: properties.functionArn,
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
            { Ref: properties.apiLogicalId },
            "/authorizers/*",
          ],
        ],
      },
    },
  };
}
