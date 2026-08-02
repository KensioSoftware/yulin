import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsError,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  deployHttpApi,
  simAwsInEuWest2,
} from "../../../../test/apigatewayv2/cfn-deploy.js";
import { SimHttpApi } from "../api/sim-http-api.js";
import { simCfnHttpApiTemplateFactory } from "./sim-cfn-http-api-template.factory.js";

const template = simCfnHttpApiTemplateFactory.make({
  routeKeys: ["GET /orders"],
  outputs: {
    ApiRef: { Value: { Ref: "Api" } },
    ApiIdAttribute: { Value: { "Fn::GetAtt": ["Api", "ApiId"] } },
    IntegrationRef: { Value: { Ref: "Integration" } },
    IntegrationIdAttribute: {
      Value: { "Fn::GetAtt": ["Integration", "IntegrationId"] },
    },
    RouteRef: { Value: { Ref: "Route1" } },
    RouteIdAttribute: { Value: { "Fn::GetAtt": ["Route1", "RouteId"] } },
    StageRef: { Value: { Ref: "Stage" } },
  },
});

/**
 * A resolved Stack Output, which every Output in this template is a string.
 */
function output(
  outputs: ReadonlyMap<string, { readonly value: unknown }>,
  name: string,
): string {
  const value = outputs.get(name)?.value;
  assertTypeString(value);

  return value;
}

describe("API Gateway v2 CloudFormation Ref and Fn::GetAtt", () => {
  it("resolves each Resource type the way CloudFormation resolves it", async () => {
    // Given a deployed API, integration, route and stage
    const simAws = simAwsInEuWest2();
    const stack = await deployHttpApi(simAws, template);
    const { outputs } = stack;

    // When the deployed API is read back
    const httpApi = simAws.apiGatewayV2().findApi(output(outputs, "ApiRef"));
    assertNonNullable(httpApi);

    // Then Ref on the API is its id, and so is the ApiId attribute
    assertIdentical(output(outputs, "ApiRef"), httpApi.apiId);
    assertIdentical(output(outputs, "ApiIdAttribute"), httpApi.apiId);

    // And Ref on the integration is the integration id, which is what the
    // route target was joined onto
    const integrationId = output(outputs, "IntegrationRef");
    assertNonNullable(httpApi.integrations.find(integrationId));
    assertIdentical(output(outputs, "IntegrationIdAttribute"), integrationId);

    // And Ref on the route is the route id
    const routeId = output(outputs, "RouteRef");
    assertIdentical(
      httpApi.routes.find(routeId)?.target,
      `integrations/${integrationId}`,
    );
    assertIdentical(output(outputs, "RouteIdAttribute"), routeId);

    // And Ref on the stage is the stage name, which is how a stage is named
    assertIdentical(output(outputs, "StageRef"), "$default");
  });

  it("returns the generated endpoint with no trailing slash or stage segment", async () => {
    // Given a deployed API in eu-west-2
    const simAws = simAwsInEuWest2();
    const stack = await deployHttpApi(simAws, template);

    // When Fn::GetAtt ApiEndpoint is read
    const apiEndpoint = output(stack.outputs, "ApiEndpoint");
    const apiId = output(stack.outputs, "ApiRef");

    // Then it is the real AWS endpoint API Gateway generates
    assertIdentical(
      apiEndpoint,
      `https://${apiId}.execute-api.eu-west-2.amazonaws.com`,
    );
  });

  it("refuses an attribute a Resource type does not publish", async () => {
    // Given a deployed API and its stage
    const simAws = simAwsInEuWest2();
    const stack = await deployHttpApi(simAws, template);
    const apiResource = stack.getResource("Api");
    const integrationResource = stack.getResource("Integration");
    const routeResource = stack.getResource("Route1");
    const stageResource = stack.getResource("Stage");
    assertNonNullable(apiResource);
    assertNonNullable(integrationResource);
    assertNonNullable(routeResource);
    assertNonNullable(stageResource);

    // When an attribute none of them publishes is asked for
    // Then each says so, and the stage says so for every attribute name,
    // since AWS documents none for it
    assertStringIncludes(
      assertThrowsError(() => apiResource.attributeValue("Endpoint")).message,
      "Unsupported AWS::ApiGatewayV2::Api attribute Endpoint",
    );
    assertStringIncludes(
      assertThrowsError(() => integrationResource.attributeValue("Uri"))
        .message,
      "Unsupported AWS::ApiGatewayV2::Integration attribute Uri",
    );
    assertStringIncludes(
      assertThrowsError(() => routeResource.attributeValue("RouteKey")).message,
      "Unsupported AWS::ApiGatewayV2::Route attribute RouteKey",
    );
    assertStringIncludes(
      assertThrowsError(() => stageResource.attributeValue("StageName"))
        .message,
      "Unsupported AWS::ApiGatewayV2::Stage attribute StageName",
    );
  });

  it("deploys the API as a simulated HTTP API object", async () => {
    // Given a deployed API
    const simAws = simAwsInEuWest2();
    const stack = await deployHttpApi(simAws, template);

    // When the CloudFormation Resource is read
    const apiResource = stack.getResource("Api");

    // Then it is backed by the simulated API itself, not a stand-in
    assertNonNullable(apiResource);
    assertInstanceOf(apiResource.simResource, SimHttpApi);
  });
});
