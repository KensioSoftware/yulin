import { describe, expect, it } from "vitest";

import { simHttpApiPathSegments } from "./sim-http-api-path-segments.js";

describe("Splitting a request path into sim HTTP API route segments", () => {
  it("splits a path on its slashes", () => {
    // Given a request path
    // When it is split
    // Then the leading slash produces no segment
    expect(simHttpApiPathSegments("/pets/dog/1")).toStrictEqual([
      "pets",
      "dog",
      "1",
    ]);
  });

  it("reads the root as no segments at all", () => {
    // Given the root path
    // When it is split
    // Then there is nothing for a route to match, which is what makes
    // `GET /` the route for it
    expect(simHttpApiPathSegments("/")).toStrictEqual([]);
  });

  it("ignores one trailing slash", () => {
    // Given the same path with and without a trailing slash
    // When each is split
    // Then they are the same path, so both reach the same route
    expect(simHttpApiPathSegments("/pets/")).toStrictEqual(["pets"]);
  });

  it("keeps an empty segment inside the path", () => {
    // Given a path with a doubled slash in the middle
    // When it is split
    // Then the empty segment is kept, so it matches neither a literal nor a
    // parameter and the request falls through to whatever catches it
    expect(simHttpApiPathSegments("/pets//dog")).toStrictEqual([
      "pets",
      "",
      "dog",
    ]);
  });
});
