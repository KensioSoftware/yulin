import { assertIdentical, assertInstanceOf } from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimApiGatewayV2BadRequest } from "../../../error/sim-api-gateway-v2.error.js";
import { SimHttpApiDefaultRouteKey } from "./sim-http-api-default-route-key.js";
import { SimHttpApiMethodRouteKey } from "./sim-http-api-method-route-key.js";
import { SimHttpApiRouteKeyParser } from "./sim-http-api-route-key-parser.js";

const parser = new SimHttpApiRouteKeyParser();

describe("Reading a sim HTTP API route key", () => {
  it("reads the catch-all route key", () => {
    // Given the catch-all route key
    // When it is read
    const routeKey = parser.parse("$default");

    // Then it is the catch-all, which matches everything and captures nothing
    assertInstanceOf(routeKey, SimHttpApiDefaultRouteKey);
    assertIdentical(routeKey.text, "$default");
    assertIdentical(routeKey.signature, "$default");
  });

  it("reads a method and a path", () => {
    // Given a route key naming a method and a parameterised path
    // When it is read
    const routeKey = parser.parse("GET /pets/{petId}");

    // Then it keeps the text it was written with
    assertInstanceOf(routeKey, SimHttpApiMethodRouteKey);
    assertIdentical(routeKey.text, "GET /pets/{petId}");
  });

  it("erases parameter names from the signature", () => {
    // Given two route keys differing only in their parameter names
    // When both are read
    const first = parser.parse("GET /pets/{id}/toys/{toy+}");
    const second = parser.parse("GET /pets/{petId}/toys/{proxy+}");

    // Then they share a signature, because a parameter name is not part of a
    // route's identity on real AWS
    assertIdentical(first.signature, second.signature);
    assertIdentical(first.signature, "GET /pets/{}/toys/{+}");
  });

  it("reads a path of only literals", () => {
    // Given a route key with no parameters in it
    // When it is read
    const routeKey = parser.parse("ANY /admin/reports");

    // Then its signature is the key itself, since there is nothing to erase
    assertIdentical(routeKey.signature, "ANY /admin/reports");
  });

  it("refuses a lower-case method", () => {
    // Given a route key whose method is not upper-case
    // When it is read
    // Then it is refused, because it would be a route that never matched
    expect(() => parser.parse("get /pets")).toThrow(SimApiGatewayV2BadRequest);
  });

  it("refuses a method the API does not have", () => {
    // Given a route key naming something that is not an HTTP method
    // When it is read
    // Then it is refused by name
    expect(() => parser.parse("FETCH /pets")).toThrow(
      /does not name an HTTP method/,
    );
  });

  it("refuses a route key that is not a method and a path", () => {
    // Given route keys with the wrong number of parts
    // When each is read
    // Then each is refused
    expect(() => parser.parse("/pets")).toThrow(/is not a route key/);
    expect(() => parser.parse("GET /pets extra")).toThrow(/is not a route key/);
    expect(() => parser.parse("")).toThrow(/is not a route key/);
  });

  it("refuses a path that does not start with a slash", () => {
    // Given a route key whose path is relative
    // When it is read
    // Then it is refused
    expect(() => parser.parse("GET pets")).toThrow(
      /does not start with a slash/,
    );
  });

  it("refuses an unbalanced brace", () => {
    // Given route keys with a brace that does not close, or one that closes
    // in the middle of a literal
    // When each is read
    // Then each is refused as a malformed segment
    expect(() => parser.parse("GET /pets/{petId")).toThrow(
      /malformed path segment/,
    );
    expect(() => parser.parse("GET /pets/petId}")).toThrow(
      /malformed path segment/,
    );
    expect(() => parser.parse("GET /pets/pet{id}")).toThrow(
      /malformed path segment/,
    );
    expect(() => parser.parse("GET /pets/{}")).toThrow(
      /malformed path segment/,
    );
  });

  it("refuses a greedy parameter before the end of the path", () => {
    // Given a route key with a greedy parameter that is not the last segment
    // When it is read
    // Then it is refused, because nothing after it could ever match
    expect(() => parser.parse("ANY /admin/{proxy+}/reports")).toThrow(
      /greedy path parameter before the end/,
    );
  });

  it("refuses an empty path segment", () => {
    // Given a route key with a doubled slash in its path
    // When it is read
    // Then it is refused
    expect(() => parser.parse("GET /pets//dog")).toThrow(/empty path segment/);
  });

  it("reads the root path", () => {
    // Given a route key for the root of the API
    // When it is read
    const routeKey = parser.parse("GET /");

    // Then it has no segments to match, which is the empty request path
    assertIdentical(routeKey.signature, "GET /");
  });
});
