import { assertIdentical, assertNonNullable } from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import type { SimPayload1Event } from "../../../serve/payload-1/sim-payload-1-event.type.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simRestApiLambdaProxyFactory } from "../api/sim-rest-api-lambda-proxy.factory.js";
import type { SimRestApi } from "../api/sim-rest-api.js";
import type { SimRestApiRequestAuthorizerEvent } from "./auth/sim-rest-api-request-authorizer-event.js";

function localUrl(restApi: SimRestApi, path = "", stage = "prod"): string {
  return new SimAwsLocalUrl({
    input: `${restApi.invokeUrl(stage)}${path}`,
  }).toString();
}

/**
 * A handler echoing the event back, for tests about what reaches it.
 */
const echoHandler = (event: SimPayload1Event): unknown => ({
  statusCode: 200,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(event),
});

/**
 * A policy allowing or refusing one resource, as an authorizer answers with.
 */
function policy(effect: "Allow" | "Deny", resource: string): unknown {
  return {
    principalId: "user-6",
    policyDocument: {
      Version: "2012-10-17",
      Statement: [
        { Action: "execute-api:Invoke", Effect: effect, Resource: resource },
      ],
    },
  };
}

describe("Authorizing a sim REST API method with a REQUEST authorizer", () => {
  it("invokes the authorizer with the whole request", async () => {
    // Given an API behind a REQUEST authorizer, on a stage carrying a variable
    const simAws = new SimAws();
    const seen: SimRestApiRequestAuthorizerEvent[] = [];
    const restApi = await simRestApiLambdaProxyFactory.make(
      {
        resourcePaths: ["/orders/{orderId}"],
        httpMethod: "GET",
        stageVariables: { catalogue: "v2" },
        authorizerIdentitySource: "method.request.header.X-Tenant",
        requestAuthorizerHandler: (event) => {
          seen.push(event);
          return policy("Allow", event.methodArn);
        },
      },
      simAws,
    );

    // When one order is requested, with a repeated query string parameter
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(restApi, "/orders/6?tag=new&tag=urgent"),
      { headers: { "x-tenant": "acme" } },
    );

    // Then the authorizer saw the request rather than one header of it
    assertIdentical(response.status, 200);
    const [event] = seen;
    assertNonNullable(event);
    assertIdentical(event.type, "REQUEST");
    assertIdentical(
      event.methodArn,
      `arn:aws:execute-api:${simAws.accountRegionScope().accountRegionScope.regionName}:` +
        `${simAws.accountRegionScope().accountRegionScope.accountId}:` +
        `${restApi.apiId}/prod/GET/orders/6`,
    );
    assertIdentical(event.resource, "/orders/{orderId}");
    assertIdentical(event.path, "/prod/orders/6");
    assertIdentical(event.httpMethod, "GET");
    assertIdentical(event.headers["x-tenant"], "acme");
    expect(event.multiValueHeaders["x-tenant"]).toStrictEqual(["acme"]);
    // The single-value map keeps the last of a repeated parameter and the
    // multi-value one keeps them all, as payload format 1.0 sends them
    expect(event.queryStringParameters).toStrictEqual({ tag: "urgent" });
    expect(event.multiValueQueryStringParameters).toStrictEqual({
      tag: ["new", "urgent"],
    });
    expect(event.pathParameters).toStrictEqual({ orderId: "6" });
    expect(event.stageVariables).toStrictEqual({ catalogue: "v2" });
    assertIdentical(event.requestContext.stage, "prod");
    assertIdentical(event.requestContext.resourcePath, "/orders/{orderId}");
  });

  it("sends empty maps where the request carried nothing", async () => {
    // Given an API on a stage with no variables, whose resource captures
    // nothing
    const simAws = new SimAws();
    const seen: SimRestApiRequestAuthorizerEvent[] = [];
    const restApi = await simRestApiLambdaProxyFactory.make(
      {
        resourcePaths: ["/orders"],
        httpMethod: "GET",
        requestAuthorizerHandler: (event) => {
          seen.push(event);
          return policy("Allow", event.methodArn);
        },
      },
      simAws,
    );

    // When it is requested with no query string
    await new SimAwsHttp({ simAws }).fetch(localUrl(restApi, "/orders"), {
      headers: { authorization: "Bearer session-6" },
    });

    // Then the maps are empty rather than null, which is what AWS's own
    // example of this event carries and what a handler reading a member off
    // one depends on
    const [event] = seen;
    assertNonNullable(event);
    expect(event.queryStringParameters).toStrictEqual({});
    expect(event.multiValueQueryStringParameters).toStrictEqual({});
    expect(event.pathParameters).toStrictEqual({});
    expect(event.stageVariables).toStrictEqual({});
  });

  it("identifies a caller by a header and a query string parameter", async () => {
    // Given an authorizer wanting both before it decides anything
    const simAws = new SimAws();
    let invocations = 0;
    const restApi = await simRestApiLambdaProxyFactory.make(
      {
        resourcePaths: ["/orders"],
        httpMethod: "GET",
        authorizerIdentitySource:
          "method.request.header.X-Tenant,method.request.querystring.token",
        requestAuthorizerHandler: (event) => {
          invocations += 1;
          return policy("Allow", event.methodArn);
        },
      },
      simAws,
    );
    const http = new SimAwsHttp({ simAws });
    const headers = { "x-tenant": "acme" };

    // When the request carries both, and then only one of them
    const admitted = await http.fetch(
      localUrl(restApi, "/orders?token=session-6"),
      { headers },
    );
    const refused = await http.fetch(localUrl(restApi, "/orders"), { headers });

    // Then the request missing one of them is refused before the function is
    // asked anything, as real API Gateway refuses it
    assertIdentical(admitted.status, 200);
    assertIdentical(refused.status, 401);
    assertIdentical(invocations, 1);
    expect(await refused.json()).toStrictEqual({ message: "Unauthorized" });
  });

  it("evaluates the policy against the method the request named", async () => {
    // Given an authorizer that always allows one path and nothing else
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      {
        resourcePaths: ["/orders", "/invoices"],
        httpMethod: "GET",
        authorizerIdentitySource: "method.request.querystring.token",
        requestAuthorizerHandler: (event) =>
          policy("Allow", event.methodArn.replace(/\/[^/]+$/u, "/orders")),
      },
      simAws,
    );
    const http = new SimAwsHttp({ simAws });

    // When each path is requested with the same token
    const allowed = await http.fetch(localUrl(restApi, "/orders?token=six"));
    const refused = await http.fetch(localUrl(restApi, "/invoices?token=six"));

    // Then the one the policy names is served and the other is not, the same
    // way a TOKEN authorizer's document is read
    assertIdentical(allowed.status, 200);
    assertIdentical(refused.status, 403);
    expect(await refused.json()).toStrictEqual({
      Message: "User is not authorized to access this resource",
    });
  });

  it("hands the authorizer's context to the handler", async () => {
    // Given an authorizer passing something on about the caller
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      {
        resourcePaths: ["/orders"],
        httpMethod: "POST",
        handler: echoHandler,
        authorizerIdentitySource: "method.request.header.X-Tenant",
        requestAuthorizerHandler: (event) => ({
          ...(policy("Allow", event.methodArn) as object),
          context: { tenantId: event.headers["x-tenant"] },
        }),
      },
      simAws,
    );

    // When the API is requested with a body the integration still has to read
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(restApi, "/orders"),
      {
        method: "POST",
        headers: { "x-tenant": "acme", "content-type": "application/json" },
        body: JSON.stringify({ sku: "6" }),
      },
    );
    const event = (await response.json()) as SimPayload1Event;

    // Then the handler read both the body and what the authorizer passed on,
    // since the authorizer was shown a copy of the request
    assertIdentical(response.status, 200);
    assertIdentical(event.body, JSON.stringify({ sku: "6" }));
    expect(event.requestContext.authorizer).toStrictEqual({
      principalId: "user-6",
      tenantId: "acme",
    });
  });

  it("answers 401 for the Unauthorized the authorizer returns", async () => {
    // Given an authorizer refusing what the request carried
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      {
        resourcePaths: ["/orders"],
        httpMethod: "GET",
        authorizerIdentitySource: "method.request.querystring.token",
        requestAuthorizerHandler: () => ({ errorMessage: "Unauthorized" }),
      },
      simAws,
    );

    // When the API is requested with a token it does not admit
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(restApi, "/orders?token=stale"),
    );

    // Then the caller is told what it presented was rejected, as it is for a
    // TOKEN authorizer
    assertIdentical(response.status, 401);
  });
});
