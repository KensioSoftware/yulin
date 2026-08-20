import { MappedFactory } from "@kensio/part-factory";

import type { CfnTemplateBodyRecord } from "../../cloudformation/template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * What a test asks for when it wants a template declaring a REST API as an
 * OpenAPI document rather than as Resources.
 *
 * `paths` and `components` are the document's own, so a test states the one
 * operation or security scheme it is about. The resources, methods and integrations they declare are created by
 * the import, so the template carries no `AWS::ApiGateway::Resource` or
 * `Method` of its own.
 */
export interface SimCfnImportedRestApiTemplateInput {
  readonly functionName: string;
  /** The inline function code the document's integrations point at. */
  readonly handlerSource: string;
  readonly paths: SimCfnTemplateValueRecord;
  readonly components: SimCfnTemplateValueRecord;
  /** Merged into the Api Resource last, so a test states one property. */
  readonly apiProperties: SimCfnTemplateValueRecord;
  /** Resources the template carries beyond the ones built here. */
  readonly resources: SimCfnTemplateValueRecord;
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
 * Builds a template deploying a REST API from an `AWS::ApiGateway::RestApi`
 * `Body`.
 *
 * ```typescript
 * const stack = await simAws.cloudFormation().deployTemplate({
 *   stackName: "pets-stack",
 *   template: simCfnImportedRestApiTemplateFactory.make({ paths }),
 * });
 * ```
 *
 * The document's integration URI is an `Fn::GetAtt` on the function, which is
 * what a template writes and what a synthesized one resolves, so a deployed
 * API reaches a function the same stack created. The `ApiUrl` output is the
 * URL CDK publishes, built from a `Ref` to the API and a `Ref` to the stage.
 */
export const simCfnImportedRestApiTemplateFactory = new MappedFactory<
  SimCfnImportedRestApiTemplateInput,
  CfnTemplateBodyRecord
>(
  () => ({
    functionName: "pets",
    handlerSource: "exports.handler = async () => 'pets';",
    paths: {},
    components: {},
    apiProperties: {},
    resources: {},
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
        },
      },
      Api: {
        Type: "AWS::ApiGateway::RestApi",
        Properties: {
          Body: {
            openapi: "3.0.1",
            info: { title: input.functionName, version: "1.0" },
            paths: input.paths,
            components: input.components,
          },
          ...input.apiProperties,
        },
      },
      Deployment: {
        Type: "AWS::ApiGateway::Deployment",
        Properties: { RestApiId: { Ref: "Api" } },
      },
      Stage: {
        Type: "AWS::ApiGateway::Stage",
        Properties: {
          RestApiId: { Ref: "Api" },
          DeploymentId: { Ref: "Deployment" },
          StageName: "prod",
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
            ],
          ],
        },
      },
    },
  }),
);

/**
 * The `x-amazon-apigateway-integration` a template's document carries, whose
 * URI is resolved from the function the same stack deploys.
 */
export const simCfnImportedRestApiIntegration: SimCfnTemplateValueRecord = {
  type: "aws_proxy",
  httpMethod: "POST",
  uri: { "Fn::GetAtt": ["Handler", "Arn"] },
};
