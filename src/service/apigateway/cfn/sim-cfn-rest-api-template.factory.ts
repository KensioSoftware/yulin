import { MappedFactory } from "@kensio/part-factory";

import type { CfnTemplateBodyRecord } from "../../cloudformation/template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import {
  methodLogicalIds,
  methodResources,
  pathResources,
} from "./sim-cfn-rest-api-template-parts.js";

/**
 * One method of the template's API, and where in the path tree it hangs.
 *
 * The path is the segments under the root, so `[]` is a method on the root
 * resource and `["orders", "{orderId}"]` is one two nodes down. Methods
 * sharing a prefix share the nodes that spell it, as a template written by
 * hand or by CDK does.
 */
export interface SimCfnRestApiTemplateMethod {
  readonly httpMethod: string;
  readonly path: readonly string[];
}

/**
 * What a test asks for when it wants a template deploying a REST API in front
 * of a Lambda function.
 *
 * Seven Resources stand between a test and an API it can call, and most tests
 * about the API Gateway Resource types are about one property of one of them.
 * The `*Properties` records are merged in last, so a test states the one
 * property it is about rather than the whole template.
 */
export interface SimCfnRestApiTemplateInput {
  readonly functionName: string;
  /** The inline function code every method of the API hands its requests to. */
  readonly handlerSource: string;
  readonly methods: readonly SimCfnRestApiTemplateMethod[];
  readonly stageName: string;
  readonly apiProperties: SimCfnTemplateValueRecord;
  /** Applied to every method the template carries. */
  readonly methodProperties: SimCfnTemplateValueRecord;
  /** Applied to the `Integration` block of every method. */
  readonly integrationProperties: SimCfnTemplateValueRecord;
  readonly deploymentProperties: SimCfnTemplateValueRecord;
  readonly stageProperties: SimCfnTemplateValueRecord;
  /** Resources the template carries beyond the ones built here. */
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
 * Builds a template deploying a REST API that proxies to a Lambda function.
 *
 * ```typescript
 * const stack = await simAws.cloudFormation().deployTemplate({
 *   stackName: "orders-stack",
 *   template: simCfnRestApiTemplateFactory.make({
 *     methods: [{ httpMethod: "GET", path: ["orders"] }],
 *   }),
 * });
 * ```
 *
 * The `AWS::Lambda::Permission` is the grant CDK writes for a REST API proxy
 * integration, so a request served through this template is one a real
 * permission admitted. The `ApiUrl` output is the URL CDK publishes, built
 * from a `Ref` to the API and a `Ref` to the stage.
 */
export const simCfnRestApiTemplateFactory = new MappedFactory<
  SimCfnRestApiTemplateInput,
  CfnTemplateBodyRecord
>(
  () => ({
    functionName: "orders",
    handlerSource: "exports.handler = async () => 'orders';",
    methods: [{ httpMethod: "GET", path: ["orders"] }],
    stageName: "prod",
    apiProperties: {},
    methodProperties: {},
    integrationProperties: {},
    deploymentProperties: {},
    stageProperties: {},
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
                "/*/*/*",
              ],
            ],
          },
        },
      },
      Api: {
        Type: "AWS::ApiGateway::RestApi",
        Properties: { Name: "orders", ...input.apiProperties },
      },
      ...pathResources(input),
      ...methodResources(input),
      Deployment: {
        Type: "AWS::ApiGateway::Deployment",
        Properties: {
          RestApiId: { Ref: "Api" },
          ...input.deploymentProperties,
        },
        DependsOn: methodLogicalIds(input),
      },
      Stage: {
        Type: "AWS::ApiGateway::Stage",
        Properties: {
          RestApiId: { Ref: "Api" },
          DeploymentId: { Ref: "Deployment" },
          StageName: input.stageName,
          ...input.stageProperties,
        },
      },
      ...input.resources,
    },
    Outputs: {
      ApiUrl: {
        Value: {
          "Fn::Join": [
            "",
            [
              "https://",
              { Ref: "Api" },
              ".execute-api.",
              { Ref: "AWS::Region" },
              ".",
              { Ref: "AWS::URLSuffix" },
              "/",
              { Ref: "Stage" },
              "/",
            ],
          ],
        },
      },
      ...input.outputs,
    },
  }),
);
