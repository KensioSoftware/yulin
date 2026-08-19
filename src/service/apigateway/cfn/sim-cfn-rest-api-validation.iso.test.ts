import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertTrue,
  assertTypeString,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import {
  deployRestApi,
  deployRestApiFailure,
  simAwsInEuWest2,
} from "../../../../test/apigateway/cfn-deploy.js";
import { simCfnRestApiTemplateFactory } from "./sim-cfn-rest-api-template.factory.js";

describe("API Gateway REST API CloudFormation refusals", () => {
  it("refuses a method asking to be authorized", async () => {
    // Given a method declaring a Lambda authorizer
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const error = await deployRestApiFailure(
      simAws,
      simCfnRestApiTemplateFactory.make({
        methodProperties: { AuthorizationType: "CUSTOM" },
      }),
    );

    // Then PutMethod refuses it, rather than serving open a method real AWS
    // would have gated
    assertStringIncludes(
      error.message,
      "PutMethod authorizationType 'CUSTOM' is not simulated",
    );
  });

  it("refuses a method requiring an API key", async () => {
    // Given a method behind a usage plan
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const error = await deployRestApiFailure(
      simAws,
      simCfnRestApiTemplateFactory.make({
        methodProperties: { ApiKeyRequired: true },
      }),
    );

    // Then PutMethod refuses it, since a method here would answer requests
    // real AWS rejects
    assertStringIncludes(
      error.message,
      "PutMethod apiKeyRequired is not simulated",
    );
  });

  it("refuses an integration type that answers from somewhere else", async () => {
    // Given a mock integration
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const error = await deployRestApiFailure(
      simAws,
      simCfnRestApiTemplateFactory.make({
        integrationProperties: { Type: "MOCK", Uri: undefined },
      }),
    );

    // Then PutIntegration refuses it, since only a Lambda proxy integration is
    // simulated
    assertStringIncludes(
      error.message,
      "PutIntegration type 'MOCK' is not simulated",
    );
  });

  it("takes the method back out when its integration is refused", async () => {
    // Given the same mock integration, whose method PutMethod has already
    // declared by the time the integration is read
    const simAws = simAwsInEuWest2();
    await deployRestApiFailure(
      simAws,
      simCfnRestApiTemplateFactory.make({
        integrationProperties: { Type: "MOCK", Uri: undefined },
      }),
    );

    // When the API the failed stack created is read back
    const { items } = await simAws.apiGateway().getRestApis({ input: {} });
    const [created] = items;
    assertNonNullable(created);
    const restApi = simAws.apiGateway().findRestApi(created.id);

    // Then the resource carries no method. The corrected template deploys
    // rather than being refused for a method that already exists.
    assertNonNullable(restApi);
    expect(
      restApi.resources.findByPath("/orders")?.listMethods(),
    ).toStrictEqual([]);
  });

  it("refuses a path part real API Gateway would refuse", async () => {
    // Given a node spelling two segments in one path part
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const error = await deployRestApiFailure(
      simAws,
      simCfnRestApiTemplateFactory.make({
        methods: [{ httpMethod: "GET", path: ["orders/open"] }],
      }),
    );

    // Then CreateResource refuses it with the reason it refuses it
    assertStringIncludes(error.message, "Path part 'orders/open' is invalid");
  });

  it("refuses a stage naming a deployment the API has not got", async () => {
    // Given a stage whose DeploymentId names nothing, which is what a `Ref` to
    // a Resource this simulation skipped resolves to
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const error = await deployRestApiFailure(
      simAws,
      simCfnRestApiTemplateFactory.make({
        stageProperties: { DeploymentId: "SomeSkippedResource" },
      }),
    );

    // Then CreateStage refuses it, rather than publishing a stage that serves
    // nothing
    assertStringIncludes(
      error.message,
      "Invalid deployment identifier specified: SomeSkippedResource",
    );
  });
});

describe("API Gateway REST API CloudFormation Resource types left out", () => {
  it("records the Account Resource CDK writes beside a RestApi", async () => {
    // Given the Account-wide CloudWatch role CDK synthesises with a default
    // RestApi
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const stack = await deployRestApi(
      simAws,
      simCfnRestApiTemplateFactory.make({
        resources: {
          ApiAccount: {
            Type: "AWS::ApiGateway::Account",
            Properties: {
              CloudWatchRoleArn: { "Fn::GetAtt": ["HandlerRole", "Arn"] },
            },
          },
        },
      }),
    );

    // Then the API deploys and the Account Resource is reported, since nothing
    // here logs a request to CloudWatch
    const apiId = stack.getResource("Api")?.refValue;
    assertTypeString(apiId);
    assertNonNullable(simAws.apiGateway().findRestApi(apiId));

    const account = stack.resources.get("ApiAccount");
    assertNonNullable(account);
    assertTrue(account.skipped);
    assertStringIncludes(
      account.skippedReason ?? "",
      "Unsupported sim API Gateway CloudFormation Resource Account, because " +
        "the Account-wide CloudWatch role is not simulated",
    );
    assertIdentical(account.status, "CREATE_COMPLETE");
  });

  it("records an authorizer as a Resource nothing created", async () => {
    // Given a template declaring a Lambda authorizer
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const stack = await deployRestApi(
      simAws,
      simCfnRestApiTemplateFactory.make({
        resources: {
          Authorizer: {
            Type: "AWS::ApiGateway::Authorizer",
            Properties: {
              RestApiId: { Ref: "Api" },
              Name: "session-cookie",
              Type: "REQUEST",
            },
          },
        },
      }),
    );

    // Then the rest of the stack deploys and the authorizer is reported
    const authorizer = stack.resources.get("Authorizer");
    assertNonNullable(authorizer);
    assertTrue(authorizer.skipped);
    assertStringIncludes(
      authorizer.skippedReason ?? "",
      "Unsupported sim API Gateway CloudFormation Resource Authorizer, " +
        "because authorizing a method is not simulated",
    );
  });
});
