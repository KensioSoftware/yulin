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
  ignoredReasons,
  simAwsInEuWest2,
} from "../../../../test/apigatewayv2/cfn-deploy.js";
import { simCfnHttpApiTemplateFactory } from "./sim-cfn-http-api-template.factory.js";

describe("API Gateway v2 CloudFormation validation", () => {
  it("creates an API without a property outside the simulated set", async () => {
    // Given an API asking for CORS, which is not simulated
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const stack = await deployHttpApi(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        apiProperties: {
          CorsConfiguration: { AllowOrigins: ["https://example.com"] },
        },
      }),
    );

    // Then the API is created without answering preflight requests, and the
    // record names the logical ID, the property and what is simulated
    assertTrue(stack.getResource("Api")?.deployed);

    const [reason] = ignoredReasons(stack);
    assertNonNullable(reason);
    assertStringIncludes(reason, "Api");
    assertStringIncludes(
      reason,
      "AWS::ApiGatewayV2::Api property CorsConfiguration is not simulated",
    );
    assertStringIncludes(
      reason,
      "The simulated properties are Name, ProtocolType, Description, " +
        "DisableExecuteApiEndpoint, Body, FailOnWarnings.",
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

  it("creates an integration without a property outside the simulated set", async () => {
    // Given an integration asking for a request timeout
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const stack = await deployHttpApi(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        integrationProperties: { TimeoutInMillis: 5000 },
      }),
    );

    // Then the integration is created without a timeout, and the record names
    // the Resource type, the logical ID, the property and what is simulated
    assertTrue(stack.getResource("Integration")?.deployed);

    const [reason] = ignoredReasons(stack);
    assertNonNullable(reason);
    assertStringIncludes(reason, "Integration");
    assertStringIncludes(
      reason,
      "AWS::ApiGatewayV2::Integration property TimeoutInMillis is not " +
        "simulated",
    );
    assertStringIncludes(
      reason,
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

  it("refuses an Api declaring a resource policy", async () => {
    // Given a template carrying the Policy property a REST API takes
    const simAws = simAwsInEuWest2();

    // When it is deployed
    const error = await deployHttpApiFailure(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        apiProperties: {
          Policy: {
            Version: "2012-10-17",
            Statement: [
              { Effect: "Allow", Action: "execute-api:Invoke", Resource: "*" },
            ],
          },
        },
      }),
    );

    // Then it is refused by name, saying an HTTP API has no such property
    // rather than reporting a gap that will be filled later
    assertStringIncludes(
      error.message,
      "an HTTP API has no resource policy, and AWS has no such property on " +
        "this Resource type",
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

  it("creates a stage without a property outside the simulated set", async () => {
    // Given a stage asking for throttling settings
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const stack = await deployHttpApi(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        stageProperties: {
          DefaultRouteSettings: { ThrottlingBurstLimit: 10 },
        },
      }),
    );

    // Then the stage is created throttling nothing, and the record names the
    // Resource type, the logical ID, the property and what is simulated
    assertTrue(stack.getResource("Stage")?.deployed);

    const [reason] = ignoredReasons(stack);
    assertNonNullable(reason);
    assertStringIncludes(reason, "Stage");
    assertStringIncludes(
      reason,
      "AWS::ApiGatewayV2::Stage property DefaultRouteSettings is not " +
        "simulated",
    );
    assertStringIncludes(
      reason,
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
