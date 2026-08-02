import {
  assertFalse,
  assertNonNullable,
  assertStringIncludes,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  deployHttpApi,
  deployHttpApiFailure,
  simAwsInEuWest2,
} from "../../../../test/apigatewayv2/cfn-deploy.js";
import { simCfnHttpApiTemplateFactory } from "./sim-cfn-http-api-template.factory.js";

describe("API Gateway v2 CloudFormation validation", () => {
  it("refuses an API property outside the simulated set", async () => {
    // Given an API asking for CORS, which is not simulated
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const error = await deployHttpApiFailure(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        apiProperties: {
          CorsConfiguration: { AllowOrigins: ["https://example.com"] },
        },
      }),
    );

    // Then the stack fails, naming the Resource type, the logical ID, the
    // property and what is simulated
    assertStringIncludes(error.message, "Api");
    assertStringIncludes(
      error.message,
      "AWS::ApiGatewayV2::Api Api property CorsConfiguration is not simulated",
    );
    assertStringIncludes(
      error.message,
      "The simulated properties are Name, ProtocolType, Description, " +
        "DisableExecuteApiEndpoint.",
    );
  });

  it("refuses an OpenAPI document body on an API", async () => {
    // Given an API declared as an OpenAPI document rather than as Resources
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const error = await deployHttpApiFailure(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        apiProperties: { Body: { openapi: "3.0.1" } },
      }),
    );

    // Then the stack fails rather than deploying an API with no routes
    assertStringIncludes(
      error.message,
      "AWS::ApiGatewayV2::Api Api property Body is not simulated",
    );
  });

  it("refuses a WebSocket API", async () => {
    // Given an API asking for the WebSocket protocol
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const error = await deployHttpApiFailure(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        apiProperties: { ProtocolType: "WEBSOCKET" },
      }),
    );

    // Then CreateApi refuses it, with the reason it refuses it
    assertStringIncludes(error.message, "WebSocket APIs are not simulated");
  });

  it("refuses an integration property outside the simulated set", async () => {
    // Given an integration asking for a request timeout
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const error = await deployHttpApiFailure(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        integrationProperties: { TimeoutInMillis: 5000 },
      }),
    );

    // Then the stack fails, naming the Resource type, the logical ID, the
    // property and what is simulated
    assertStringIncludes(
      error.message,
      "AWS::ApiGatewayV2::Integration Integration property TimeoutInMillis " +
        "is not simulated",
    );
    assertStringIncludes(
      error.message,
      "The simulated properties are ApiId, IntegrationType, IntegrationUri, " +
        "PayloadFormatVersion, Description.",
    );
  });

  it("refuses payload format 1.0", async () => {
    // Given an integration asking for the older payload format
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const error = await deployHttpApiFailure(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        integrationProperties: { PayloadFormatVersion: "1.0" },
      }),
    );

    // Then CreateIntegration refuses it, with the reason it refuses it
    assertStringIncludes(
      error.message,
      "payload format 1.0 builds a different event",
    );
  });

  it("refuses a route authorization type that is not simulated", async () => {
    // Given a route asking for a JWT authorizer
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const error = await deployHttpApiFailure(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        routeProperties: { AuthorizationType: "JWT" },
      }),
    );

    // Then CreateRoute refuses it rather than deploying an open route
    assertStringIncludes(
      error.message,
      "CreateRoute AuthorizationType 'JWT' is not simulated",
    );
  });

  it("refuses a route naming an authorizer that was skipped", async () => {
    // Given a template with an authorizer Resource, which is not simulated,
    // and a route pointing at it
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const error = await deployHttpApiFailure(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        routeProperties: { AuthorizerId: { Ref: "Authorizer" } },
        resources: {
          Authorizer: {
            Type: "AWS::ApiGatewayV2::Authorizer",
            Properties: {
              ApiId: { Ref: "Api" },
              AuthorizerType: "JWT",
              Name: "jwt",
            },
          },
        },
      }),
    );

    // Then the stack fails naming both the route and the authorizer it would
    // have pointed at, rather than deploying a route open here and closed on
    // AWS
    assertStringIncludes(error.message, "Route1");
    assertStringIncludes(
      error.message,
      "property AuthorizerId is Authorizer, the logical ID of a Resource " +
        "this simulation did not create",
    );
  });

  it("refuses an authorizer id naming nothing in the template", async () => {
    // Given a route carrying an authorizer id written out rather than
    // referenced, so no skipped Resource explains it
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const error = await deployHttpApiFailure(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        routeProperties: { AuthorizerId: "abc123" },
      }),
    );

    // Then the allow-list refuses the property, since authorizers are not
    // simulated at all
    assertStringIncludes(
      error.message,
      "AWS::ApiGatewayV2::Route Route1 property AuthorizerId is not simulated",
    );
  });

  it("refuses a stage property outside the simulated set", async () => {
    // Given a stage asking for throttling settings
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const error = await deployHttpApiFailure(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        stageProperties: {
          DefaultRouteSettings: { ThrottlingBurstLimit: 10 },
        },
      }),
    );

    // Then the stack fails, naming the Resource type, the logical ID, the
    // property and what is simulated
    assertStringIncludes(
      error.message,
      "AWS::ApiGatewayV2::Stage Stage property DefaultRouteSettings is not " +
        "simulated",
    );
    assertStringIncludes(
      error.message,
      "The simulated properties are ApiId, StageName, AutoDeploy, " +
        "StageVariables, Description.",
    );
  });

  it("refuses a stage that does not deploy itself", async () => {
    // Given a stage waiting for a Deployment, which is not simulated
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const error = await deployHttpApiFailure(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        stageProperties: { AutoDeploy: false },
      }),
    );

    // Then CreateStage refuses it, with the reason it refuses it
    assertStringIncludes(
      error.message,
      "CreateStage requires AutoDeploy: true",
    );
  });

  it("refuses a malformed property value by shape", async () => {
    // Given a stage whose variables are a list rather than an object
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const error = await deployHttpApiFailure(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        stageProperties: { StageVariables: ["catalogue"] },
      }),
    );

    // Then the stack fails saying what the property has to be
    assertStringIncludes(
      error.message,
      "Invalid AWS::ApiGatewayV2::Stage Stage: StageVariables must be an " +
        "object of strings",
    );
  });

  it("skips a Resource type nothing creates yet", async () => {
    // Given a template carrying an authorizer no route points at
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const stack = await deployHttpApi(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        routeKeys: ["GET /orders"],
        resources: {
          Authorizer: {
            Type: "AWS::ApiGatewayV2::Authorizer",
            Properties: { ApiId: { Ref: "Api" }, AuthorizerType: "JWT" },
          },
          Model: {
            Type: "AWS::ApiGatewayV2::Model",
            Properties: { ApiId: { Ref: "Api" }, Name: "Order", Schema: {} },
          },
        },
      }),
    );

    // Then the rest of the stack deployed, and each unsupported Resource was
    // skipped with a reason, the WebSocket-only one saying so
    const authorizer = stack.getResource("Authorizer");
    const model = stack.getResource("Model");
    assertNonNullable(authorizer);
    assertNonNullable(model);
    assertTrue(authorizer.skipped);
    assertFalse(stack.getResource("Api")?.skipped ?? true);
    assertStringIncludes(
      authorizer.skippedReason ?? "",
      "Unsupported sim API Gateway v2 CloudFormation Resource Authorizer",
    );
    assertStringIncludes(
      model.skippedReason ?? "",
      "which belongs to a WebSocket API and is not simulated",
    );
  });
});
