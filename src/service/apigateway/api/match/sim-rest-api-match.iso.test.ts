import { PutMethodCommand } from "@aws-sdk/client-api-gateway";
import { assertIdentical, assertNonNullable } from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { simRestApiLambdaProxyFactory } from "../sim-rest-api-lambda-proxy.factory.js";
import type { SimRestApi } from "../sim-rest-api.js";
import {
  isSimRestApiMatch,
  type SimRestApiMatch,
} from "./sim-rest-api-match.js";
import { SimRestApiRequest } from "./sim-rest-api-request.js";

/**
 * A REST API deployed to `prod`, declaring the given paths with one method
 * each.
 */
async function givenApi(
  simAws: SimAws,
  resourcePaths: readonly string[],
  httpMethod = "GET",
): Promise<SimRestApi> {
  return await simRestApiLambdaProxyFactory.make(
    { resourcePaths, httpMethod },
    simAws,
  );
}

function matched(
  restApi: SimRestApi,
  method: string,
  path: string,
): SimRestApiMatch {
  const match = restApi.match(new SimRestApiRequest({ method, path }));
  assertNonNullable(isSimRestApiMatch(match) ? match : undefined);

  return match as SimRestApiMatch;
}

describe("Matching a request to a simulated REST API", () => {
  it("takes the stage off before walking the resource tree", async () => {
    // Given an API deployed to prod with a method on /orders
    const restApi = await givenApi(new SimAws(), ["/orders"]);

    // When a request comes in under the stage segment
    const match = matched(restApi, "GET", "/prod/orders");

    // Then the stage is the one it named, and the tree saw the rest
    assertIdentical(match.stage.stageName, "prod");
    assertIdentical(match.resource.path, "/orders");
    assertIdentical(match.method.httpMethod, "GET");
  });

  it("matches the root resource at the stage root", async () => {
    // Given a method on the API's root resource
    const restApi = await givenApi(new SimAws(), ["/"]);

    // When the stage root is requested
    const match = matched(restApi, "GET", "/prod");

    // Then the root resource answers
    assertIdentical(match.resource.path, "/");
  });

  it("captures a path parameter", async () => {
    // Given /orders/{orderId}
    const restApi = await givenApi(new SimAws(), ["/orders/{orderId}"]);

    // When one order is requested
    const match = matched(restApi, "GET", "/prod/orders/6");

    // Then the segment is captured under the parameter's name
    expect(match.pathParameters).toStrictEqual({ orderId: "6" });
  });

  it("percent-decodes a captured segment", async () => {
    // Given /orders/{orderId}
    const restApi = await givenApi(new SimAws(), ["/orders/{orderId}"]);

    // When the segment carries an encoded character
    const match = matched(restApi, "GET", "/prod/orders/a%2Fb");

    // Then the handler reads it decoded, as it does on AWS
    expect(match.pathParameters).toStrictEqual({ orderId: "a/b" });
  });

  it("prefers a literal segment over a path parameter beside it", async () => {
    // Given both /orders/{orderId} and /orders/new
    const restApi = await givenApi(new SimAws(), [
      "/orders/{orderId}",
      "/orders/new",
    ]);

    // When the literal one is requested
    const match = matched(restApi, "GET", "/prod/orders/new");

    // Then the literal wins, which is what stops {orderId} catching it
    assertIdentical(match.resource.path, "/orders/new");
    expect(match.pathParameters).toStrictEqual({});
  });

  it("gives the rest of the path to a greedy parameter", async () => {
    // Given a catch-all under the root
    const restApi = await givenApi(new SimAws(), ["/{proxy+}"], "ANY");

    // When a deep path is requested
    const match = matched(restApi, "POST", "/prod/orders/6/items");

    // Then everything after the stage is the greedy parameter
    assertIdentical(match.resource.path, "/{proxy+}");
    expect(match.pathParameters).toStrictEqual({ proxy: "orders/6/items" });
  });

  it("prefers a declared path over the greedy one beside it", async () => {
    // Given a catch-all and an explicit path
    const restApi = await givenApi(
      new SimAws(),
      ["/{proxy+}", "/orders"],
      "ANY",
    );

    // When the explicit path is requested
    const match = matched(restApi, "GET", "/prod/orders");

    // Then it answers rather than the catch-all
    assertIdentical(match.resource.path, "/orders");
  });

  it("falls back to ANY where the resource declares no such method", async () => {
    // Given a resource with only an ANY method
    const restApi = await givenApi(new SimAws(), ["/orders"], "ANY");

    // When a DELETE is requested
    const match = matched(restApi, "DELETE", "/prod/orders");

    // Then ANY answers it
    assertIdentical(match.method.httpMethod, "ANY");
  });

  it("prefers a declared method over ANY on the same resource", async () => {
    // Given a resource declaring both ANY and GET
    const simAws = new SimAws();
    const restApi = await givenApi(simAws, ["/orders"], "ANY");
    await simAws.apiGateway().putMethod(
      new PutMethodCommand({
        restApiId: restApi.apiId,
        resourceId: restApi.resources.findByPath("/orders")?.resourceId,
        httpMethod: "GET",
        authorizationType: "NONE",
      }),
    );

    // When the declared method is requested
    const match = matched(restApi, "GET", "/prod/orders");

    // Then it wins over the catch-all
    assertIdentical(match.method.httpMethod, "GET");
  });

  it("reports a stage that is not there apart from an unmatched path", async () => {
    // Given an API deployed to prod
    const restApi = await givenApi(new SimAws(), ["/orders"]);

    // When another stage is requested, and when a path the tree has not got is
    const stageMiss = restApi.match(
      new SimRestApiRequest({ method: "GET", path: "/dev/orders" }),
    );
    const routeMiss = restApi.match(
      new SimRestApiRequest({ method: "GET", path: "/prod/invoices" }),
    );

    // Then the two are told apart, because real API Gateway answers them with
    // different messages
    assertIdentical(stageMiss, "stage");
    assertIdentical(routeMiss, "route");
  });

  it("reports a method the matched resource has not got", async () => {
    // Given a resource with only a GET
    const restApi = await givenApi(new SimAws(), ["/orders"]);

    // When a POST is requested
    const match = restApi.match(
      new SimRestApiRequest({ method: "POST", path: "/prod/orders" }),
    );

    // Then nothing answers it
    assertIdentical(match, "route");
  });
});
