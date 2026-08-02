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
    // Given a route asking for IAM authorization
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const error = await deployHttpApiFailure(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        routeProperties: { AuthorizationType: "AWS_IAM" },
      }),
    );

    // Then CreateRoute refuses it rather than deploying an open route
    assertStringIncludes(
      error.message,
      "CreateRoute AuthorizationType 'AWS_IAM' is not simulated",
    );
  });

  it("refuses a JWT route naming an authorizer the template did not deploy", async () => {
    // Given a route asking for JWT authorization with an authorizer id that
    // is not one of this API's
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const error = await deployHttpApiFailure(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        routeProperties: { AuthorizationType: "JWT", AuthorizerId: "auth01" },
      }),
    );

    // Then the stack fails rather than deploying a route that is open here and
    // closed on AWS
    assertStringIncludes(
      error.message,
      "AuthorizerId auth01 names no authorizer",
    );
  });

  it("refuses a Lambda authorizer Resource", async () => {
    // Given a template carrying a Lambda REQUEST authorizer
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const error = await deployHttpApiFailure(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        resources: {
          Authorizer: {
            Type: "AWS::ApiGatewayV2::Authorizer",
            Properties: {
              ApiId: { Ref: "Api" },
              AuthorizerType: "REQUEST",
              Name: "lambda",
              IdentitySource: ["$request.header.Authorization"],
            },
          },
        },
      }),
    );

    // Then the stack fails rather than deploying an authorizer that would
    // decide with code nothing here runs
    assertStringIncludes(
      error.message,
      "CreateAuthorizer AuthorizerType 'REQUEST' is not simulated",
    );
  });

  it("refuses route scopes that are not a list of strings", async () => {
    // Given a route whose AuthorizationScopes is a single string
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const error = await deployHttpApiFailure(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        routeProperties: { AuthorizationScopes: "orders.read" },
      }),
    );

    // Then the stack fails saying what the property has to be
    assertStringIncludes(
      error.message,
      "AuthorizationScopes must be a list of strings",
    );
  });

  it("refuses an authorizer id on a route that authorizes nobody", async () => {
    // Given a route naming an authorizer while leaving its authorization type
    // at NONE
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const error = await deployHttpApiFailure(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        routeProperties: { AuthorizerId: "abc123" },
      }),
    );

    // Then CreateRoute refuses it, since the authorizer would be ignored here
    // and would leave the route open on AWS too
    assertStringIncludes(
      error.message,
      "CreateRoute AuthorizerId is set on a route with AuthorizationType NONE",
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
    // Given a template carrying a Deployment and a Model, neither simulated
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const stack = await deployHttpApi(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        routeKeys: ["GET /orders"],
        resources: {
          Deployment: {
            Type: "AWS::ApiGatewayV2::Deployment",
            Properties: { ApiId: { Ref: "Api" } },
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
    const deployment = stack.getResource("Deployment");
    const model = stack.getResource("Model");
    assertNonNullable(deployment);
    assertNonNullable(model);
    assertTrue(deployment.skipped);
    assertFalse(stack.getResource("Api")?.skipped ?? true);
    assertStringIncludes(
      deployment.skippedReason ?? "",
      "Unsupported sim API Gateway v2 CloudFormation Resource Deployment",
    );
    assertStringIncludes(
      model.skippedReason ?? "",
      "which belongs to a WebSocket API and is not simulated",
    );
  });
});
