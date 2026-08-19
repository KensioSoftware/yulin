import {
  CreateResourceCommand,
  CreateRestApiCommand,
  PutMethodCommand,
} from "@aws-sdk/client-api-gateway";
import {
  assertFalse,
  assertIdentical,
  assertUndefined,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimApiGatewayBadRequest,
  SimApiGatewayConflict,
} from "../../error/sim-api-gateway.error.js";
import type { SimApiGateway } from "../../sim-api-gateway.js";

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

  it("declares a method IAM decides, with no authorizer to name", async () => {
    // Given a resource
    const simAws = new SimAws();
    const { restApiId, resourceId } = await givenResource(simAws.apiGateway());

    // When a method asks to be authorized by IAM
    const method = await simAws.apiGateway().putMethod(
      new PutMethodCommand({
        restApiId,
        resourceId,
        httpMethod: "GET",
        authorizationType: "AWS_IAM",
      }),
    );

    // Then it carries the type and names no authorizer, since IAM decides its
    // requests rather than a function of the API's
    assertIdentical(method.authorizationType, "AWS_IAM");
    assertUndefined(method.authorizerId);
  });

  it("refuses an authorizer named by a method IAM decides", async () => {
    // Given a resource
    const simAws = new SimAws();
    const { restApiId, resourceId } = await givenResource(simAws.apiGateway());

    // When an AWS_IAM method names an authorizer as well
    const method = simAws.apiGateway().putMethod(
      new PutMethodCommand({
        restApiId,
        resourceId,
        httpMethod: "GET",
        authorizationType: "AWS_IAM",
        authorizerId: "auth123",
      }),
    );

    // Then it is refused rather than served with the id ignored, which would
    // leave the caller that wrote it reading a gate the method has not got
    await expect(method).rejects.toThrow(SimApiGatewayBadRequest);
    await expect(method).rejects.toThrow(
      "PutMethod authorizerId is set on GET /orders with authorizationType " +
        "AWS_IAM",
    );
  });

  it("refuses an authorization type nothing here enforces", async () => {
    // Given a resource
    const simAws = new SimAws();
    const { restApiId, resourceId } = await givenResource(simAws.apiGateway());

    // When a method asks to be authorized by a user pool
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
      "PutMethod authorizationType 'COGNITO_USER_POOLS' is not simulated",
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

  it("requires an authorization type, as real PutMethod does", async () => {
    // Given a resource
    const simAws = new SimAws();
    const { restApiId, resourceId } = await givenResource(simAws.apiGateway());

    // When a method is declared without one
    const method = simAws
      .apiGateway()
      .putMethod({ input: { restApiId, resourceId, httpMethod: "GET" } });

    // Then it is refused, because defaulting to NONE would declare an open
    // method for a request real AWS rejects outright
    await expect(method).rejects.toThrow(SimApiGatewayBadRequest);
    await expect(method).rejects.toThrow(
      "PutMethod requires authorizationType",
    );
  });
});
