import {
  assertIdentical,
  assertNonNullable,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import type { SimHttpApiIntegrationId } from "../integration/sim-http-api-integration.js";
import { SimHttpApiRouteKeyParser } from "./key/sim-http-api-route-key-parser.js";
import { simHttpApiPathSegments } from "./path/sim-http-api-path-segments.js";
import { SimHttpApiRouteRequest } from "./sim-http-api-route-request.js";
import { SimHttpApiRouteSelector } from "./sim-http-api-route-selector.js";
import {
  makeSimHttpApiRouteId,
  SimHttpApiRoute,
} from "./sim-http-api-route.js";

const parser = new SimHttpApiRouteKeyParser();
const selector = new SimHttpApiRouteSelector();

/**
 * Build the routes of an API from their route keys, all onto one integration.
 */
function routesFor(routeKeys: readonly string[]): SimHttpApiRoute[] {
  return routeKeys.map(
    (routeKey) =>
      new SimHttpApiRoute({
        routeId: makeSimHttpApiRouteId(),
        key: parser.parse(routeKey),
        integrationId: "abcdefgh" as SimHttpApiIntegrationId,
        authorizationType: "NONE",
      }),
  );
}

/**
 * The route key selected for one request, or undefined when nothing matched.
 */
function selectedKey(
  routeKeys: readonly string[],
  method: string,
  path: string,
): string | undefined {
  return selector.select(
    routesFor(routeKeys),
    new SimHttpApiRouteRequest({
      method,
      segments: simHttpApiPathSegments(path),
    }),
  )?.route.routeKey;
}

/**
 * AWS's published worked example of route selection, verbatim.
 */
const publishedExample = [
  "GET /pets/dog/1",
  "GET /pets/dog/{id}",
  "GET /pets/{proxy+}",
  "ANY /{proxy+}",
  "$default",
];

describe("Choosing the sim HTTP API route that serves a request", () => {
  it("selects the routes of AWS's worked example", () => {
    // Given the five routes AWS documents the selection order with
    // When each of its example requests arrives
    // Then each reaches the route AWS says it does
    assertIdentical(
      selectedKey(publishedExample, "GET", "/pets/dog/1"),
      "GET /pets/dog/1",
    );
    assertIdentical(
      selectedKey(publishedExample, "GET", "/pets/dog/2"),
      "GET /pets/dog/{id}",
    );
    assertIdentical(
      selectedKey(publishedExample, "GET", "/pets/cat/1"),
      "GET /pets/{proxy+}",
    );
    assertIdentical(
      selectedKey(publishedExample, "POST", "/test/5"),
      "ANY /{proxy+}",
    );
  });

  it("falls back to the catch-all when nothing else matches", () => {
    // Given an API with a specific route and a catch-all
    const routeKeys = ["GET /pets", "$default"];

    // When a request matches neither the method nor the path of the specific
    // route
    // Then the catch-all serves it, since it is behind everything else
    assertIdentical(selectedKey(routeKeys, "GET", "/orders"), "$default");
    assertIdentical(selectedKey(routeKeys, "POST", "/pets"), "$default");
  });

  it("prefers a literal segment to a parameter", () => {
    // Given two routes differing only at the segment the request fills
    const routeKeys = ["GET /pets/dog", "GET /pets/{petId}"];

    // When a request could match either
    // When the literal is what the request has there
    // Then the literal wins, and otherwise the parameter takes it
    assertIdentical(
      selectedKey(routeKeys, "GET", "/pets/dog"),
      "GET /pets/dog",
    );
    assertIdentical(
      selectedKey(routeKeys, "GET", "/pets/cat"),
      "GET /pets/{petId}",
    );
  });

  it("prefers a full match to a greedy one", () => {
    // Given a route of two parameters and a more literal greedy route
    const routeKeys = ["GET /{owner}/{petId}", "GET /pets/{proxy+}"];

    // When a request matches both
    // Then the fully matching route wins, which is the tier AWS documents,
    // even though the greedy one starts with a literal
    assertIdentical(
      selectedKey(routeKeys, "GET", "/pets/dog"),
      "GET /{owner}/{petId}",
    );
  });

  it("prefers an exact method to ANY", () => {
    // Given the same path routed for one method and for any method
    const routeKeys = ["GET /pets/{petId}", "ANY /pets/{petId}"];

    // When a GET arrives
    // Then the exact method wins, and another method falls to ANY
    assertIdentical(
      selectedKey(routeKeys, "GET", "/pets/6"),
      "GET /pets/{petId}",
    );
    assertIdentical(
      selectedKey(routeKeys, "DELETE", "/pets/6"),
      "ANY /pets/{petId}",
    );
  });

  it("prefers the longest literal prefix between greedy routes", () => {
    // Given two greedy routes, one reaching further into the path
    const routeKeys = ["GET /pets/dog/{proxy+}", "GET /pets/{proxy+}"];

    // When a request matches both
    // Then the one with more literal segments before the greedy one wins
    assertIdentical(
      selectedKey(routeKeys, "GET", "/pets/dog/collars/1"),
      "GET /pets/dog/{proxy+}",
    );
    assertIdentical(
      selectedKey(routeKeys, "GET", "/pets/cat/1"),
      "GET /pets/{proxy+}",
    );
  });

  it("matches no route when the method is wrong and nothing catches it", () => {
    // Given an API routing one method of one path, with no ANY route, no
    // greedy route and no catch-all
    const routeKeys = ["GET /pets"];

    // When another method of that path is requested
    const selected = selector.select(
      routesFor(routeKeys),
      new SimHttpApiRouteRequest({ method: "POST", segments: ["pets"] }),
    );

    // Then nothing serves it, which an HTTP API answers as a 404 rather than
    // the 405 a method mismatch might suggest
    assertUndefined(selected);
  });

  it("captures a path parameter from the segment it matched", () => {
    // Given a parameterised route
    const routes = routesFor(["GET /pets/{petId}/toys/{toyId}"]);

    // When a request matches it
    const selected = selector.select(
      routes,
      new SimHttpApiRouteRequest({
        method: "GET",
        segments: ["pets", "6", "toys", "9"],
      }),
    );

    // Then each parameter carries what was in its segment
    expect(selected?.pathParameters.toRecord()).toStrictEqual({
      petId: "6",
      toyId: "9",
    });
  });

  it("captures the rest of the path into a greedy parameter", () => {
    // Given a greedy route
    const routes = routesFor(["GET /pets/{proxy+}"]);

    // When a request reaches past its literal segment
    const selected = selector.select(
      routes,
      new SimHttpApiRouteRequest({
        method: "GET",
        segments: ["pets", "cat", "1"],
      }),
    );

    // Then the remainder is captured with no leading slash
    expect(selected?.pathParameters.toRecord()).toStrictEqual({
      proxy: "cat/1",
    });
  });

  it("does not match a greedy route with nothing left to take", () => {
    // Given a greedy route
    const routes = routesFor(["GET /pets/{proxy+}"]);

    // When the request path stops where the greedy segment starts
    const selected = selector.select(
      routes,
      new SimHttpApiRouteRequest({ method: "GET", segments: ["pets"] }),
    );

    // Then it does not match, because a greedy parameter needs at least one
    // segment
    assertUndefined(selected);
  });

  it("needs a segment for a parameter to match", () => {
    // Given a route ending in a parameter
    const routes = routesFor(["GET /pets/{petId}"]);

    // When the request path stops before it, or has nothing in that segment
    const short = selector.select(
      routes,
      new SimHttpApiRouteRequest({ method: "GET", segments: ["pets"] }),
    );
    const empty = selector.select(
      routes,
      new SimHttpApiRouteRequest({ method: "GET", segments: ["pets", ""] }),
    );

    // Then neither matches, because {petId} needs one segment with something
    // in it
    assertUndefined(short);
    assertUndefined(empty);
  });

  it("captures nothing for a route of only literals", () => {
    // Given a route with no parameters in it
    const routes = routesFor(["GET /pets"]);

    // When it matches a request
    const selected = selector.select(
      routes,
      new SimHttpApiRouteRequest({ method: "GET", segments: ["pets"] }),
    );

    // Then there are no path parameters, which keeps the field out of the
    // event entirely
    assertNonNullable(selected);
    assertTrue(selected.pathParameters.isEmpty);
  });

  it("matches one segment per parameter, not several", () => {
    // Given a route with one parameter at the end
    const routes = routesFor(["GET /pets/{petId}"]);

    // When a request has more path than that
    const selected = selector.select(
      routes,
      new SimHttpApiRouteRequest({
        method: "GET",
        segments: ["pets", "dog", "1"],
      }),
    );

    // Then it does not match, because {petId} takes exactly one segment
    assertUndefined(selected);
  });
});
