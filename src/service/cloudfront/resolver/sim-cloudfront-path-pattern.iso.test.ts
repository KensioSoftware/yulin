import { assertFalse, assertNumberBetween, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimCloudFrontPathPattern } from "./sim-cloudfront-path-pattern.js";

describe("SimCloudFrontPathPattern", () => {
  function pathPattern(pattern: string): SimCloudFrontPathPattern {
    return new SimCloudFrontPathPattern({ pathPattern: pattern });
  }

  /**
   * How long a match takes, so a pattern that compiles to nested wildcards is
   * told apart from one that does not.
   */
  function matchMilliseconds(
    cloudFrontPathPattern: SimCloudFrontPathPattern,
    requestPath: string,
  ): number {
    const startedAt = process.hrtime.bigint();
    cloudFrontPathPattern.matches(requestPath);

    return Number(process.hrtime.bigint() - startedAt) / 1e6;
  }

  it("reads a run of stars as one", () => {
    // Given a path pattern written with a doubled star.
    const cloudFrontPathPattern = pathPattern("/assets/**");

    // When paths inside and outside that prefix are considered.
    // Then it means what a single star means, since a star already matches
    // across a slash.
    assertTrue(cloudFrontPathPattern.matches("/assets/nested/app.css"));
    assertFalse(cloudFrontPathPattern.matches("/index.html"));
  });

  it("matches a long near miss quickly despite a run of stars", () => {
    // Given a path pattern holding a run of stars, which would compile to a
    // chain of nested wildcards if the run were left as written.
    const cloudFrontPathPattern = pathPattern(`/a${"*".repeat(10)}b`);

    // When a long path the pattern almost matches is considered, which is the
    // input that makes a backtracking engine try every split of the run.
    const elapsedMilliseconds = matchMilliseconds(
      cloudFrontPathPattern,
      `/${"a".repeat(32)}`,
    );

    // Then it settles at once, rather than in the seconds a chain of wildcards
    // takes to exhaust.
    assertNumberBetween(elapsedMilliseconds, 0, 500);
  });
});
