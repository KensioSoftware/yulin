import {
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import type { SimPayload1Event } from "../../../serve/payload-1/sim-payload-1-event.type.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simRestApiLambdaProxyFactory } from "../api/sim-rest-api-lambda-proxy.factory.js";
import type { SimRestApi } from "../api/sim-rest-api.js";
import type { SimRestApiTokenAuthorizerEvent } from "./auth/sim-rest-api-authorizer-event.js";

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

/**
 * An authorizer allowing exactly the method it was asked about.
 */
const allowingAuthorizer = (event: SimRestApiTokenAuthorizerEvent): unknown =>
  policy("Allow", event.methodArn);

describe("Authorizing a sim REST API method with a TOKEN authorizer", () => {
  it("invokes the authorizer with the token and the method ARN", async () => {
    // Given an API whose authorizer echoes the event it was invoked with back
    // through its policy
    const simAws = new SimAws();
    const seen: SimRestApiTokenAuthorizerEvent[] = [];
    const restApi = await simRestApiLambdaProxyFactory.make(
      {
        resourcePaths: ["/orders/{orderId}"],
        authorizerHandler: (event) => {
          seen.push(event);
          return policy("Allow", event.methodArn);
        },
      },
      simAws,
    );

    // When one order is requested with a token
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(restApi, "/orders/6"),
      { headers: { authorization: "Bearer session-6" } },
    );

    // Then the authorizer saw the header value and the ARN of the request,
    // which names the path that was asked for rather than the template
    assertIdentical(response.status, 200);
    const [event] = seen;
    assertNonNullable(event);
    assertIdentical(event.type, "TOKEN");
    assertIdentical(event.authorizationToken, "Bearer session-6");
    assertIdentical(
      event.methodArn,
      `arn:aws:execute-api:${simAws.accountRegionScope().accountRegionScope.regionName}:` +
        `${simAws.accountRegionScope().accountRegionScope.accountId}:` +
        `${restApi.apiId}/prod/GET/orders/6`,
    );
  });

  it("answers 403 for a Deny policy", async () => {
    // Given an authorizer refusing the method it is asked about
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      {
        authorizerHandler: (event) => policy("Deny", event.methodArn),
      },
      simAws,
    );

    // When the API is requested with a token
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(restApi, "/orders"),
      { headers: { authorization: "Bearer session-6" } },
    );

    // Then the request is refused with the body real API Gateway sends for a
    // Deny statement that matched
    assertIdentical(response.status, 403);
    expect(await response.json()).toStrictEqual({
      Message:
        "User is not authorized to access this resource with an explicit deny",
    });
  });

  it("leaves a method the policy does not cover unauthorized", async () => {
    // Given an authorizer that always allows one path and nothing else
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      {
        resourcePaths: ["/orders", "/invoices"],
        httpMethod: "GET",
        authorizerHandler: (event) =>
          policy("Allow", event.methodArn.replace(/\/[^/]+$/u, "/orders")),
      },
      simAws,
    );
    const http = new SimAwsHttp({ simAws });
    const headers = { authorization: "Bearer session-6" };

    // When each path is requested with the same token
    const allowed = await http.fetch(localUrl(restApi, "/orders"), { headers });
    const refused = await http.fetch(localUrl(restApi, "/invoices"), {
      headers,
    });

    // Then the one the policy names is served and the other is not, because
    // the document is evaluated against the ARN of the request being made
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
        handler: echoHandler,
        authorizerHandler: (event) => ({
          ...(policy("Allow", event.methodArn) as object),
          context: { tenantId: "acme", tier: "gold" },
        }),
      },
      simAws,
    );

    // When the API is requested with a token
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(restApi, "/orders"),
      { headers: { authorization: "Bearer session-6" } },
    );
    const event = (await response.json()) as SimPayload1Event;

    // Then the handler reads it beside the principal the authorizer named, all
    // flattened onto requestContext.authorizer as a REST API sends it
    expect(event.requestContext.authorizer).toStrictEqual({
      principalId: "user-6",
      tenantId: "acme",
      tier: "gold",
    });
  });

  it("leaves the authorizer block out for an open method", async () => {
    // Given an API with no authorizer in front of it
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      { handler: echoHandler },
      simAws,
    );

    // When the API is requested
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(restApi, "/orders"),
    );
    const event = (await response.json()) as SimPayload1Event;

    // Then there is no caller to describe, which is what real API Gateway
    // sends for a method authorizing nobody
    assertUndefined(event.requestContext.authorizer);
  });

  it("answers 401 for a request carrying no token", async () => {
    // Given a gated API
    const simAws = new SimAws();
    let invocations = 0;
    const restApi = await simRestApiLambdaProxyFactory.make(
      {
        authorizerHandler: (event) => {
          invocations += 1;
          return policy("Allow", event.methodArn);
        },
      },
      simAws,
    );

    // When it is requested with no Authorization header
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(restApi, "/orders"),
    );

    // Then it is refused before the authorizer is asked anything
    assertIdentical(response.status, 401);
    assertIdentical(invocations, 0);
    expect(await response.json()).toStrictEqual({ message: "Unauthorized" });
  });

  it("answers 401 for the Unauthorized the authorizer returns", async () => {
    // Given an authorizer that refuses the token it was given
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      { authorizerHandler: () => ({ errorMessage: "Unauthorized" }) },
      simAws,
    );

    // When the API is requested with a token
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(restApi, "/orders"),
      { headers: { authorization: "Bearer session-6" } },
    );

    // Then the caller is told its token was rejected, as it is on real AWS
    assertIdentical(response.status, 401);
  });

  it("answers 500 for an authorizer the API may not invoke", async () => {
    // Given an authorizer whose function granted the API nothing
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      {
        authorizerHandler: allowingAuthorizer,
        authorizerInvokePermission: false,
      },
      simAws,
    );

    // When the API is requested with a token
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(restApi, "/orders"),
      { headers: { authorization: "Bearer session-6" } },
    );

    // Then the API's own problem is a 500 rather than something the caller
    // could act on. The permission for the integration does not cover the
    // authorizer, because the two are granted on different ARNs.
    assertIdentical(response.status, 500);
    expect(await response.json()).toStrictEqual({
      message: "Internal server error",
    });
  });

  it("answers 500 for an authorizer that failed", async () => {
    // Given an authorizer whose function throws
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      {
        authorizerHandler: (): unknown => {
          throw new Error("token service unreachable");
        },
      },
      simAws,
    );

    // When the API is requested with a token
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(restApi, "/orders"),
      { headers: { authorization: "Bearer session-6" } },
    );

    // Then the caller learns nothing about it, the way an integration failure
    // tells it nothing
    assertIdentical(response.status, 500);
  });

  it("answers 500 for a response API Gateway could not read", async () => {
    // Given an authorizer answering a shape that is not a policy
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      { authorizerHandler: () => ({ isAuthorized: true }) },
      simAws,
    );

    // When the API is requested with a token
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(restApi, "/orders"),
      { headers: { authorization: "Bearer session-6" } },
    );

    // Then it is a 500, because a REST API authorizer always answers a policy
    // where an HTTP API one may answer a boolean
    assertIdentical(response.status, 500);
  });

  it("closes a method whose authorizer was deleted", async () => {
    // Given a gated API whose authorizer is then removed
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      { authorizerHandler: allowingAuthorizer },
      simAws,
    );
    const [authorizer] = restApi.authorizers.list();
    await simAws.apiGateway().deleteAuthorizer({
      input: {
        restApiId: restApi.apiId,
        authorizerId: authorizer?.authorizerId,
      },
    });

    // When the API is requested with a token
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(restApi, "/orders"),
      { headers: { authorization: "Bearer session-6" } },
    );

    // Then the method stays closed, since there is nothing left to send the
    // request through
    assertIdentical(response.status, 401);
  });
});
