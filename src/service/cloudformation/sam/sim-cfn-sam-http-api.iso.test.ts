import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertObjectEquals,
  assertResponseStatus,
  assertTypeString,
  assertUndefined,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import type { SimHttpApiStage } from "../../apigatewayv2/api/stage/sim-http-api-stage.js";
import type { SimHttpApi } from "../../apigatewayv2/api/sim-http-api.js";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnDeployedStack } from "../stack/sim-cfn-deployed-stack.type.js";
import type { CfnTemplateBodyRecord } from "../template/sim-cfn-template.js";
import {
  samHttpApiTemplateLogicalId,
  samHttpApiTemplateStageLogicalId,
  simCfnSamHttpApiTemplateFactory,
} from "./api/sim-cfn-sam-http-api-template.factory.js";

/**
 * The `x-amazon-apigateway-integration` a document declares its routes with,
 * whose URI is the function the same template deploys.
 */
const documentIntegration = {
  type: "aws_proxy",
  httpMethod: "POST",
  uri: { "Fn::GetAtt": ["Handler", "Arn"] },
  payloadFormatVersion: "2.0",
};

/**
 * Deploy a SAM template and wait for the API it holds to be serving.
 */
async function deployHttpApi(
  simAws: SimAws,
  template: CfnTemplateBodyRecord,
): Promise<SimCfnDeployedStack> {
  const stack = await simAws
    .cloudFormation()
    .deployTemplate({ stackName: "orders-stack", template });
  await stack.waitForDeployComplete();

  return stack;
}

/**
 * Request a path of the API the stack deployed, through the endpoint the stack
 * reported for it.
 */
async function requestApi(
  simAws: SimAws,
  stack: SimCfnDeployedStack,
  path: string,
): Promise<Response> {
  const apiEndpoint = stack.outputs.get("ApiEndpoint")?.value;
  assertTypeString(apiEndpoint);

  return await new SimAwsHttp({ simAws }).fetch(
    new SimAwsLocalUrl({ input: `${apiEndpoint}${path}` }).toString(),
  );
}

describe("SAM Serverless HttpApi expansion", () => {
  it("deploys a SAM HTTP API as an API and the stage that serves it", async () => {
    // Given a SAM template declaring one HTTP API routing to a function
    const simAws = new SimAws();

    // When it is deployed
    const stack = await deployHttpApi(
      simAws,
      simCfnSamHttpApiTemplateFactory.make(),
    );

    // Then the SAM logical ID is a simulated HTTP API, with a stage of its own
    const apiResource = stack.getResource(samHttpApiTemplateLogicalId);
    assertNonNullable(apiResource);
    assertIdentical(apiResource.type, "AWS::ApiGatewayV2::Api");

    const stageResource = stack.getResource(samHttpApiTemplateStageLogicalId);
    assertNonNullable(stageResource);
    assertIdentical(stageResource.type, "AWS::ApiGatewayV2::Stage");
    assertArrayEmpty(stack.skippedResources);

    // And the route the template declared against it is served from that stage
    const response = await requestApi(simAws, stack, "/orders");

    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), "GET /orders $default");
  });

  it("answers Ref and Fn::GetAtt against the SAM logical ID", async () => {
    // Given a SAM template outputting what its API's logical ID resolves to
    const simAws = new SimAws();

    // When it is deployed
    const stack = await deployHttpApi(
      simAws,
      simCfnSamHttpApiTemplateFactory.make(),
    );

    // Then both answer for the API the SAM Resource was expanded into
    const httpApi = stack.getResource(samHttpApiTemplateLogicalId)
      ?.simResource as SimHttpApi;
    assertNonNullable(httpApi);

    assertIdentical(stack.outputs.get("ApiId")?.value, httpApi.apiId);
    assertIdentical(
      stack.outputs.get("ApiEndpoint")?.value,
      `https://${httpApi.apiId}.execute-api.${simAws.defaultRegionName}.amazonaws.com`,
    );

    // And the API the routes named by ApiId is that one, since it served them
    const response = await requestApi(simAws, stack, "/orders");
    assertResponseStatus(response, 200, await describeResponse(response));
  });

  it("imports the API from the OpenAPI document it declares", async () => {
    // Given an API declaring its routes as a DefinitionBody rather than as
    // Resources of their own
    const simAws = new SimAws();

    // When it is deployed
    const stack = await deployHttpApi(
      simAws,
      simCfnSamHttpApiTemplateFactory.make({
        routeKey: undefined,
        apiProperties: {
          DefinitionBody: {
            openapi: "3.0.1",
            info: { title: "orders-api", version: "1.0" },
            paths: {
              "/orders/{orderId}": {
                get: {
                  "x-amazon-apigateway-integration": documentIntegration,
                },
              },
            },
          },
        },
      }),
    );

    // Then the document's routes are the API's, and its title named the API
    const response = await requestApi(simAws, stack, "/orders/YL-1");

    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), "GET /orders/{orderId} $default");

    const httpApi = stack.getResource(samHttpApiTemplateLogicalId)
      ?.simResource as SimHttpApi;
    assertNonNullable(httpApi);
    assertIdentical(httpApi.name, "orders-api");
  });

  it("deploys the stage the API names, under the path it is served at", async () => {
    // Given an API naming a stage rather than taking the default one
    const simAws = new SimAws();

    // When it is deployed
    const stack = await deployHttpApi(
      simAws,
      simCfnSamHttpApiTemplateFactory.make({
        apiProperties: {
          StageName: "prod",
          StageVariables: { table: "orders-prod" },
        },
      }),
    );

    // Then the stage carries the name, and the variables the API stated
    const stageResource = stack.getResource("OrdersprodStage");
    assertNonNullable(stageResource);

    const stage = stageResource.simResource as SimHttpApiStage;
    assertIdentical(stage.stageName, "prod");
    assertObjectEquals(stage.stageVariables, { table: "orders-prod" });

    // And it serves the API's routes under its own path segment
    const response = await requestApi(simAws, stack, "/prod/orders");

    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), "GET /orders prod");
  });

  it("records an API declaring a DefinitionUri as unsupported", async () => {
    // Given an API whose document is a file this reads nothing from
    const simAws = new SimAws();

    // When it is deployed
    const stack = await deployHttpApi(
      simAws,
      simCfnSamHttpApiTemplateFactory.make({
        routeKey: undefined,
        apiProperties: { DefinitionUri: "openapi/orders.yaml" },
      }),
    );

    // Then the API is recorded the way any Resource type nothing models is,
    // rather than deployed as an API serving nothing
    assertArrayLength(stack.skippedResources, 1);
    const skipped = stack.skippedResources[0];
    assertNonNullable(skipped);
    assertIdentical(skipped.logicalId, samHttpApiTemplateLogicalId);
    assertIdentical(
      skipped.skippedReason,
      "Unsupported sim CloudFormation Resource service Serverless",
    );
  });

  it("names the stage of an API whose stage name is no identifier", async () => {
    // Given an API naming a stage a logical ID cannot be built out of, which
    // SAM hashes into one
    const simAws = new SimAws();

    // When it is deployed
    const stack = await deployHttpApi(
      simAws,
      simCfnSamHttpApiTemplateFactory.make({
        apiProperties: { StageName: "orders-dev" },
      }),
    );

    // Then the stage carries the logical ID SAM hashes the name into, and
    // serves the API's routes
    const stage = stack.getResource("OrdersStageaed0986a76")
      ?.simResource as SimHttpApiStage;
    assertNonNullable(stage);
    assertIdentical(stage.stageName, "orders-dev");

    const response = await requestApi(simAws, stack, "/orders-dev/orders");

    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), "GET /orders orders-dev");
  });

  it("leaves out the stage of an API the template conditioned out", async () => {
    // Given an API the template only deploys under a condition it fails
    const simAws = new SimAws();

    // When it is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Transform: "AWS::Serverless-2016-10-31",
        Conditions: {
          IsProduction: { "Fn::Equals": ["dev", "prod"] },
        },
        Resources: {
          Orders: {
            Type: "AWS::Serverless::HttpApi",
            Condition: "IsProduction",
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then neither the API nor the stage it would have been served from was
    // created
    assertUndefined(stack.getResource(samHttpApiTemplateLogicalId));
    assertUndefined(stack.getResource(samHttpApiTemplateStageLogicalId));
  });

  it("serves a function whose HttpApi event names the API by ApiId", async () => {
    // Given a function routed to the API the template declared, which is how a
    // SAM template puts a function behind an API of its own
    const simAws = new SimAws();

    // When it is deployed
    const stack = await deployHttpApi(simAws, {
      Transform: "AWS::Serverless-2016-10-31",
      Resources: {
        Orders: { Type: "AWS::Serverless::HttpApi" },
        Handler: {
          Type: "AWS::Serverless::Function",
          Properties: {
            Handler: "index.handler",
            Runtime: "nodejs22.x",
            InlineCode: `
exports.handler = async (event) => ({
  statusCode: 200,
  headers: { "content-type": "text/plain" },
  body: event.routeKey + " " + event.requestContext.stage,
});
`,
            Events: {
              Get: {
                Type: "HttpApi",
                Properties: {
                  ApiId: { Ref: samHttpApiTemplateLogicalId },
                  Path: "/orders",
                  Method: "GET",
                },
              },
            },
          },
        },
      },
      Outputs: {
        ApiEndpoint: {
          Value: { "Fn::GetAtt": [samHttpApiTemplateLogicalId, "ApiEndpoint"] },
        },
      },
    });

    // Then the event's route is served from the expanded API's stage
    const response = await requestApi(simAws, stack, "/orders");

    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), "GET /orders $default");
  });
});
