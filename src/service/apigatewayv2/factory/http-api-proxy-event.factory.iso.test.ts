import { VariantFactory } from "@kensio/part-factory";
import {
  assertIdentical,
  assertObjectMatches,
  assertStringIncludes,
  assertUndefined,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { httpApiProxyEventFactory } from "./http-api-proxy-event.factory.js";

describe("The HTTP API proxy invocation event factory", () => {
  it("makes an event an HTTP API would send its integration", () => {
    // When an event is made with nothing said about the request
    const event = httpApiProxyEventFactory.make();

    // Then it is an unauthorized GET / on the API's default stage
    assertObjectMatches(event, {
      version: "2.0",
      routeKey: "GET /",
      rawPath: "/",
      requestContext: {
        accountId: "anonymous",
        http: { method: "GET", path: "/" },
        routeKey: "GET /",
        stage: "$default",
      },
    });

    // And the endpoint is an execute-api one rather than a Function URL
    assertStringIncludes(
      event.requestContext.domainName,
      ".execute-api.us-east-1.amazonaws.com",
    );

    // And a route with no authorizer describes no caller, as on AWS
    assertUndefined(event.requestContext.authorizer);
    assertUndefined(event.pathParameters);
    assertUndefined(event.stageVariables);
  });

  it("names the route the request would have matched", () => {
    // When an event is made for a POST to a path
    const event = httpApiProxyEventFactory.make({
      rawPath: "/orders",
      requestContext: { http: { method: "POST" } },
    });

    // Then the route key is that route, in both places the event names it
    assertIdentical(event.routeKey, "POST /orders");
    assertIdentical(event.requestContext.routeKey, "POST /orders");
  });

  it("takes the request from the route key it was given", () => {
    // When an event is made naming only the route
    const event = httpApiProxyEventFactory.make({ routeKey: "DELETE /orders" });

    // Then the request is the one that route matches
    assertIdentical(event.requestContext.http.method, "DELETE");
    assertIdentical(event.rawPath, "/orders");
    assertIdentical(event.requestContext.routeKey, "DELETE /orders");
  });

  it("leaves the path alone for a parameterised route", () => {
    // When an event is made for a route whose path is a template
    const event = httpApiProxyEventFactory.make({
      routeKey: "GET /orders/{orderId}",
      rawPath: "/orders/YL-1",
      pathParameters: { orderId: "YL-1" },
    });

    // Then the concrete path the request asked for is the one the event
    // carries, while the route key keeps its template
    assertIdentical(event.rawPath, "/orders/YL-1");
    assertIdentical(event.requestContext.http.path, "/orders/YL-1");
    assertIdentical(event.routeKey, "GET /orders/{orderId}");
    expect(event.pathParameters).toStrictEqual({ orderId: "YL-1" });
  });

  it("reports a real method for a route that takes any of them", () => {
    // When an event is made for an ANY route
    const event = httpApiProxyEventFactory.make({ routeKey: "ANY /orders" });

    // Then the request came in with a method, since ANY is a route's word for
    // the methods it accepts rather than one a request can use
    assertIdentical(event.requestContext.http.method, "GET");
    assertIdentical(event.rawPath, "/orders");
    assertIdentical(event.routeKey, "ANY /orders");

    // And the test can still say which method the request used
    const posted = httpApiProxyEventFactory.make({
      routeKey: "ANY /orders",
      requestContext: { http: { method: "POST" } },
    });
    assertIdentical(posted.requestContext.http.method, "POST");
    assertIdentical(posted.routeKey, "ANY /orders");
  });

  it("names the request itself for a $default route", () => {
    // When an event is made for the catch-all route
    const event = httpApiProxyEventFactory.make({
      routeKey: "$default",
      rawPath: "/anything",
    });

    // Then the route key stays $default and the path is the one asked for
    assertIdentical(event.routeKey, "$default");
    assertIdentical(event.rawPath, "/anything");
    assertIdentical(event.requestContext.http.path, "/anything");
  });

  it("keeps the API's identity in step with its hostname", () => {
    // When an event names the API by its id
    const event = httpApiProxyEventFactory.make({
      requestContext: { apiId: "abcdefghij" },
    });

    // Then the endpoint hostname and the host header are that API's
    assertIdentical(
      event.requestContext.domainName,
      "abcdefghij.execute-api.us-east-1.amazonaws.com",
    );
    assertIdentical(
      event.headers["host"],
      "abcdefghij.execute-api.us-east-1.amazonaws.com",
    );
  });

  it("describes a caller a JWT authorizer admitted", () => {
    // Given a variant factory for requests behind a JWT authorizer
    const signedInFactory = new VariantFactory(httpApiProxyEventFactory, {
      requestContext: {
        authorizer: { jwt: { claims: { sub: "YL-1" }, scopes: null } },
      },
    });

    // When an event is made from it
    const event = signedInFactory.make({ rawPath: "/account" });

    // Then the handler reads the claims off the event as it would on AWS
    assertIdentical(
      event.requestContext.authorizer?.jwt?.claims["sub"],
      "YL-1",
    );
    assertIdentical(event.routeKey, "GET /account");
  });
});
