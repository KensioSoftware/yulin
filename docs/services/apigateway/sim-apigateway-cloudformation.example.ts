/**
 * Deploying a simulated REST API from a CloudFormation template.
 */

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "orders-stack",
  template: {
    Resources: {
      HandlerRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: "orders-role",
          AssumeRolePolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: { Service: "lambda.amazonaws.com" },
                Action: "sts:AssumeRole",
              },
            ],
          },
        },
      },
      Handler: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: "orders",
          Role: { "Fn::GetAtt": ["HandlerRole", "Arn"] },
          Handler: "index.handler",
          Runtime: "nodejs20.x",
          Code: {
            ZipFile:
              "exports.handler = async (event) => ({ statusCode: 200, body: 'order ' + event.pathParameters.orderId });",
          },
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
        Properties: { Name: "orders" },
      },
      OrdersResource: {
        Type: "AWS::ApiGateway::Resource",
        Properties: {
          RestApiId: { Ref: "Api" },
          ParentId: { "Fn::GetAtt": ["Api", "RootResourceId"] },
          PathPart: "orders",
        },
      },
      OrderResource: {
        Type: "AWS::ApiGateway::Resource",
        Properties: {
          RestApiId: { Ref: "Api" },
          ParentId: { Ref: "OrdersResource" },
          PathPart: "{orderId}",
        },
      },
      GetOrder: {
        Type: "AWS::ApiGateway::Method",
        Properties: {
          RestApiId: { Ref: "Api" },
          ResourceId: { Ref: "OrderResource" },
          HttpMethod: "GET",
          AuthorizationType: "NONE",
          Integration: {
            Type: "AWS_PROXY",
            IntegrationHttpMethod: "POST",
            Uri: {
              "Fn::Join": [
                "",
                [
                  "arn:aws:apigateway:",
                  { Ref: "AWS::Region" },
                  ":lambda:path/2015-03-31/functions/",
                  { "Fn::GetAtt": ["Handler", "Arn"] },
                  "/invocations",
                ],
              ],
            },
          },
        },
      },
      Deployment: {
        Type: "AWS::ApiGateway::Deployment",
        Properties: { RestApiId: { Ref: "Api" } },
        DependsOn: ["GetOrder"],
      },
      Stage: {
        Type: "AWS::ApiGateway::Stage",
        Properties: {
          RestApiId: { Ref: "Api" },
          DeploymentId: { Ref: "Deployment" },
          StageName: "prod",
        },
      },
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
    },
  },
});

await stack.waitForDeployComplete();

// https://<api-id>.execute-api.us-east-1.sim-aws.localhost/prod/
const apiUrl = stack.output("ApiUrl");

const srv = await serveSimAws({ simAws });

const response = await fetch(srv.localUrl(`${apiUrl}orders/6`));

console.log(response.status);
// 200

console.log(await response.text());
// "order 6"

await srv.close();
