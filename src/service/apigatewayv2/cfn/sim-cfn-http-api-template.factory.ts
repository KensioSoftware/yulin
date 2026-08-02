import { MappedFactory } from "@kensio/part-factory";

import type { CfnTemplateBodyRecord } from "../../cloudformation/template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * What a test asks for when it wants a template deploying an HTTP API in front
 * of a Lambda function.
 *
 * Six Resources stand between a test and an API it can call, and most tests
 * about the API Gateway Resource types are about one property of one of them.
 * The four `*Properties` records are merged in last, so a test states the one
 * property it is about rather than the whole template.
 */
export interface SimCfnHttpApiTemplateInput {
  readonly functionName: string;
  /** The inline function code every route of the API hands its requests to. */
  readonly handlerSource: string;
  /** The route keys the API routes, all onto the one integration. */
  readonly routeKeys: readonly string[];
  readonly apiProperties: SimCfnTemplateValueRecord;
  readonly stageProperties: SimCfnTemplateValueRecord;
  readonly integrationProperties: SimCfnTemplateValueRecord;
  /** Applied to every route the template carries. */
  readonly routeProperties: SimCfnTemplateValueRecord;
  /** Resources the template carries beyond the six built here. */
  readonly resources: SimCfnTemplateValueRecord;
  readonly outputs: SimCfnTemplateValueRecord;
}

const assumeRolePolicyDocument = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { Service: "lambda.amazonaws.com" },
      Action: "sts:AssumeRole",
    },
  ],
};

/**
 * Builds a template deploying an HTTP API that proxies to a Lambda function.
 *
 * ```typescript
 * const stack = await simAws.cloudFormation().deployTemplate({
 *   stackName: "orders-stack",
 *   template: simCfnHttpApiTemplateFactory.make({
 *     routeKeys: ["GET /orders"],
 *   }),
 * });
 * ```
 *
 * The `AWS::Lambda::Permission` is the grant CDK writes for an HTTP API
 * integration, so a request served through this template is one a real
 * permission admitted.
 */
export const simCfnHttpApiTemplateFactory = new MappedFactory<
  SimCfnHttpApiTemplateInput,
  CfnTemplateBodyRecord
>(
  () => ({
    functionName: "orders",
    handlerSource: "exports.handler = async () => 'orders';",
    routeKeys: ["$default"],
    apiProperties: {},
    stageProperties: {},
    integrationProperties: {},
    routeProperties: {},
    resources: {},
    outputs: {},
  }),
  (input) => ({
    Resources: {
      HandlerRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: `${input.functionName}-role`,
          AssumeRolePolicyDocument: assumeRolePolicyDocument,
        },
      },
      Handler: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: input.functionName,
          Role: { "Fn::GetAtt": ["HandlerRole", "Arn"] },
          Code: { ZipFile: input.handlerSource },
          Handler: "index.handler",
          Runtime: "nodejs20.x",
        },
      },
      HandlerPermission: {
        Type: "AWS::Lambda::Permission",
        Properties: {
          Action: "lambda:InvokeFunction",
          FunctionName: { "Fn::GetAtt": ["Handler", "Arn"] },
          Principal: "apigateway.amazonaws.com",
          SourceArn: {
            "Fn::Join": [
              "",
              [
                "arn:aws:execute-api:",
                { Ref: "AWS::Region" },
                ":",
                { Ref: "AWS::AccountId" },
                ":",
                { Ref: "Api" },
                "/*/*",
              ],
            ],
          },
        },
      },
      Api: {
        Type: "AWS::ApiGatewayV2::Api",
        Properties: {
          Name: "orders",
          ProtocolType: "HTTP",
          ...input.apiProperties,
        },
      },
      Stage: {
        Type: "AWS::ApiGatewayV2::Stage",
        Properties: {
          ApiId: { Ref: "Api" },
          StageName: "$default",
          AutoDeploy: true,
          ...input.stageProperties,
        },
      },
      Integration: {
        Type: "AWS::ApiGatewayV2::Integration",
        Properties: {
          ApiId: { Ref: "Api" },
          IntegrationType: "AWS_PROXY",
          IntegrationUri: { "Fn::GetAtt": ["Handler", "Arn"] },
          PayloadFormatVersion: "2.0",
          ...input.integrationProperties,
        },
      },
      ...routeResources(input),
      ...input.resources,
    },
    Outputs: {
      ApiEndpoint: { Value: { "Fn::GetAtt": ["Api", "ApiEndpoint"] } },
      ...input.outputs,
    },
  }),
);

/**
 * The logical ID of the Resource carrying one of the template's route keys.
 *
 * A test asserting on a route names it through here, so the numbering stays in
 * one place.
 */
export function simCfnHttpApiRouteLogicalId(index: number): string {
  return `Route${String(index + 1)}`;
}

/**
 * One AWS::ApiGatewayV2::Route Resource per route key, all pointing at the one
 * integration through the `Fn::Join` target CDK writes.
 */
function routeResources(
  input: SimCfnHttpApiTemplateInput,
): SimCfnTemplateValueRecord {
  const routes: SimCfnTemplateValueRecord = {};

  for (const [index, routeKey] of input.routeKeys.entries()) {
    routes[simCfnHttpApiRouteLogicalId(index)] = {
      Type: "AWS::ApiGatewayV2::Route",
      Properties: {
        ApiId: { Ref: "Api" },
        RouteKey: routeKey,
        AuthorizationType: "NONE",
        Target: {
          "Fn::Join": ["", ["integrations/", { Ref: "Integration" }]],
        },
        ...input.routeProperties,
      },
    };
  }

  return routes;
}
