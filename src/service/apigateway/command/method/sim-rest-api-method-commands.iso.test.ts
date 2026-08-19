import {
  CreateResourceCommand,
  CreateRestApiCommand,
  DeleteMethodCommand,
  GetIntegrationCommand,
  GetMethodCommand,
  PutIntegrationCommand,
  PutMethodCommand,
} from "@aws-sdk/client-api-gateway";
import {
  assertFalse,
  assertIdentical,
  assertNonNullable,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimApiGatewayBadRequest,
  SimApiGatewayConflict,
  SimApiGatewayNotFound,
} from "../../error/sim-api-gateway.error.js";
import type { SimApiGateway } from "../../sim-api-gateway.js";

const functionArn = "arn:aws:lambda:eu-west-2:111111111111:function:orders";

const invokePathUri = `arn:aws:apigateway:eu-west-2:lambda:path/2015-03-31/functions/${functionArn}/invocations`;

/**
 * A REST API with one resource under its root, which is what a method needs.
 */
async function givenResource(
  apiGateway: SimApiGateway,
): Promise<{ readonly restApiId: string; readonly resourceId: string }> {
  const created = await apiGateway.createRestApi(
    new CreateRestApiCommand({ name: "orders" }),
  );
  const restApiId = created.id;
  const resource = await apiGateway.createResource(
    new CreateResourceCommand({
      restApiId,
      parentId: created.rootResourceId,
      pathPart: "orders",
    }),
  );

  return { restApiId, resourceId: resource.id };
}

describe("Sim API Gateway REST API method commands", () => {
  it("declares a method on a resource", async () => {
    // Given a resource
    const simAws = new SimAws();
    const { restApiId, resourceId } = await givenResource(simAws.apiGateway());

    // When a method is declared on it
    const method = await simAws.apiGateway().putMethod(
      new PutMethodCommand({
        restApiId,
        resourceId,
        httpMethod: "GET",
        authorizationType: "NONE",
        operationName: "listOrders",
      }),
    );

    // Then the resource carries it
    assertIdentical(method.httpMethod, "GET");
    assertIdentical(method.authorizationType, "NONE");
    assertIdentical(method.operationName, "listOrders");
    assertFalse(method.apiKeyRequired);
  });

  it("refuses a second method of the same name on one resource", async () => {
    // Given a resource with a GET method
    const simAws = new SimAws();
    const { restApiId, resourceId } = await givenResource(simAws.apiGateway());
    await simAws.apiGateway().putMethod(
      new PutMethodCommand({
        restApiId,
        resourceId,
        httpMethod: "GET",
        authorizationType: "NONE",
      }),
    );

    // When GET is declared on it again
    const again = simAws.apiGateway().putMethod(
      new PutMethodCommand({
        restApiId,
        resourceId,
        httpMethod: "GET",
        authorizationType: "NONE",
      }),
    );

    // Then it is refused, since one resource declares each method once
    await expect(again).rejects.toThrow(SimApiGatewayConflict);
  });

  it("refuses a method asking for an authorizer", async () => {
    // Given a resource
    const simAws = new SimAws();
    const { restApiId, resourceId } = await givenResource(simAws.apiGateway());

    // When a method asks to be authorized
    const method = simAws.apiGateway().putMethod(
      new PutMethodCommand({
        restApiId,
        resourceId,
        httpMethod: "GET",
        authorizationType: "COGNITO_USER_POOLS",
      }),
    );

    // Then it is refused, because a method served open here would pass a test
    // that real AWS would reject
    await expect(method).rejects.toThrow(SimApiGatewayBadRequest);
    await expect(method).rejects.toThrow(
      "authorizing a method is not simulated",
    );
  });

  it("refuses a method requiring an API key", async () => {
    // Given a resource
    const simAws = new SimAws();
    const { restApiId, resourceId } = await givenResource(simAws.apiGateway());

    // When a method requires an API key
    const method = simAws.apiGateway().putMethod(
      new PutMethodCommand({
        restApiId,
        resourceId,
        httpMethod: "GET",
        authorizationType: "NONE",
        apiKeyRequired: true,
      }),
    );

    // Then it is refused rather than ignored
    await expect(method).rejects.toThrow(SimApiGatewayBadRequest);
    await expect(method).rejects.toThrow("apiKeyRequired is not simulated");
  });

  it("refuses an unrecognised HTTP method", async () => {
    // Given a resource
    const simAws = new SimAws();
    const { restApiId, resourceId } = await givenResource(simAws.apiGateway());

    // When a lowercase method is declared
    const method = simAws.apiGateway().putMethod(
      new PutMethodCommand({
        restApiId,
        resourceId,
        httpMethod: "get",
        authorizationType: "NONE",
      }),
    );

    // Then it is refused, since a served request is matched on the uppercase
    // form and would reach nothing
    await expect(method).rejects.toThrow(SimApiGatewayBadRequest);
    await expect(method).rejects.toThrow("httpMethod 'get' is invalid");
  });

  it("puts a Lambda proxy integration behind a method", async () => {
    // Given a resource with an ANY method
    const simAws = new SimAws();
    const { restApiId, resourceId } = await givenResource(simAws.apiGateway());
    await simAws.apiGateway().putMethod(
      new PutMethodCommand({
        restApiId,
        resourceId,
        httpMethod: "ANY",
        authorizationType: "NONE",
      }),
    );

    // When a Lambda proxy integration is put behind it
    const integration = await simAws.apiGateway().putIntegration(
      new PutIntegrationCommand({
        restApiId,
        resourceId,
        httpMethod: "ANY",
        type: "AWS_PROXY",
        integrationHttpMethod: "POST",
        uri: invokePathUri,
      }),
    );

    // Then the method carries it, holding the function ARN the invoke path
    // wrapped
    assertIdentical(integration.type, "AWS_PROXY");
    assertIdentical(integration.httpMethod, "POST");
    assertIdentical(integration.uri, functionArn);
    const method = await simAws
      .apiGateway()
      .getMethod(
        new GetMethodCommand({ restApiId, resourceId, httpMethod: "ANY" }),
      );
    assertNonNullable(method.methodIntegration);
    assertIdentical(method.methodIntegration.uri, functionArn);
  });

  it("keeps the qualifier of an aliased function apart from its name", async () => {
    // Given a resource with a method
    const simAws = new SimAws();
    const { restApiId, resourceId } = await givenResource(simAws.apiGateway());
    await simAws.apiGateway().putMethod(
      new PutMethodCommand({
        restApiId,
        resourceId,
        httpMethod: "GET",
        authorizationType: "NONE",
      }),
    );

    // When the integration names an alias of a function
    await simAws.apiGateway().putIntegration(
      new PutIntegrationCommand({
        restApiId,
        resourceId,
        httpMethod: "GET",
        type: "AWS_PROXY",
        integrationHttpMethod: "POST",
        uri: `${functionArn}:live`,
      }),
    );

    // Then the alias is held apart, so the integration follows it wherever it
    // is moved to afterwards
    const restApi = simAws.apiGateway().findRestApi(restApiId);
    const integration = restApi
      ?.requireResource(resourceId)
      .findMethod("GET")?.integration;
    assertNonNullable(integration);
    assertIdentical(integration.lambdaUri.functionName, "orders");
    assertIdentical(integration.lambdaUri.qualifier, "live");
  });

  it("refuses an integration type it cannot answer from", async () => {
    // Given a resource with a method
    const simAws = new SimAws();
    const { restApiId, resourceId } = await givenResource(simAws.apiGateway());
    await simAws.apiGateway().putMethod(
      new PutMethodCommand({
        restApiId,
        resourceId,
        httpMethod: "GET",
        authorizationType: "NONE",
      }),
    );

    // When a MOCK integration is put behind it
    const integration = simAws.apiGateway().putIntegration(
      new PutIntegrationCommand({
        restApiId,
        resourceId,
        httpMethod: "GET",
        type: "MOCK",
      }),
    );

    // Then it is refused, since only a Lambda proxy integration is simulated
    await expect(integration).rejects.toThrow(SimApiGatewayBadRequest);
    await expect(integration).rejects.toThrow("type 'MOCK' is not simulated");
  });

  it("refuses an integration URI that names no Lambda function", async () => {
    // Given a resource with a method
    const simAws = new SimAws();
    const { restApiId, resourceId } = await givenResource(simAws.apiGateway());
    await simAws.apiGateway().putMethod(
      new PutMethodCommand({
        restApiId,
        resourceId,
        httpMethod: "GET",
        authorizationType: "NONE",
      }),
    );

    // When the integration points somewhere else
    const integration = simAws.apiGateway().putIntegration(
      new PutIntegrationCommand({
        restApiId,
        resourceId,
        httpMethod: "GET",
        type: "AWS_PROXY",
        integrationHttpMethod: "POST",
        uri: "https://orders.example.com/",
      }),
    );

    // Then it is refused with what a URI here can name
    await expect(integration).rejects.toThrow(SimApiGatewayBadRequest);
    await expect(integration).rejects.toThrow(
      "is not a simulated invocation target",
    );
  });

  it("refuses an integration against a method that is not declared", async () => {
    // Given a resource with no methods
    const simAws = new SimAws();
    const { restApiId, resourceId } = await givenResource(simAws.apiGateway());

    // When an integration is put behind a method
    const integration = simAws.apiGateway().putIntegration(
      new PutIntegrationCommand({
        restApiId,
        resourceId,
        httpMethod: "GET",
        type: "AWS_PROXY",
        integrationHttpMethod: "POST",
        uri: functionArn,
      }),
    );

    // Then it is refused, since nothing would ever reach it
    await expect(integration).rejects.toThrow(SimApiGatewayNotFound);
  });

  it("reports no integration for a method that has none", async () => {
    // Given a method with nothing behind it
    const simAws = new SimAws();
    const { restApiId, resourceId } = await givenResource(simAws.apiGateway());
    await simAws.apiGateway().putMethod(
      new PutMethodCommand({
        restApiId,
        resourceId,
        httpMethod: "GET",
        authorizationType: "NONE",
      }),
    );

    // When its integration is read
    const integration = simAws
      .apiGateway()
      .getIntegration(
        new GetIntegrationCommand({ restApiId, resourceId, httpMethod: "GET" }),
      );

    // Then there is none to report
    await expect(integration).rejects.toThrow(SimApiGatewayNotFound);
  });

  it("takes the integration with the method it belongs to", async () => {
    // Given a method with an integration behind it
    const simAws = new SimAws();
    const { restApiId, resourceId } = await givenResource(simAws.apiGateway());
    await simAws.apiGateway().putMethod(
      new PutMethodCommand({
        restApiId,
        resourceId,
        httpMethod: "GET",
        authorizationType: "NONE",
      }),
    );
    await simAws.apiGateway().putIntegration(
      new PutIntegrationCommand({
        restApiId,
        resourceId,
        httpMethod: "GET",
        type: "AWS_PROXY",
        integrationHttpMethod: "POST",
        uri: functionArn,
      }),
    );

    // When the method is deleted
    await simAws
      .apiGateway()
      .deleteMethod(
        new DeleteMethodCommand({ restApiId, resourceId, httpMethod: "GET" }),
      );

    // Then the integration goes with it, since it was part of the method
    await expect(
      simAws.apiGateway().getIntegration(
        new GetIntegrationCommand({
          restApiId,
          resourceId,
          httpMethod: "GET",
        }),
      ),
    ).rejects.toThrow(SimApiGatewayNotFound);
  });
});
