import { assertFalse, assertNumberBetween, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimCloudFrontPathPattern } from "./sim-cloudfront-path-pattern.js";

describe("SimCloudFrontPathPattern", () => {
  function pathPattern(pattern: string): SimCloudFrontPathPattern {
    return new SimCloudFrontPathPattern({ pathPattern: pattern });
  }

  interface TimedMatch {
    readonly elapsedMilliseconds: number;
    readonly matched: boolean;
  }

  /**
   * What a match answered and how long it took to answer it, so that a pattern
   * compiling to nested wildcards is told apart from one that does not without
   * losing sight of whether the answer was right.
   */
  function timedMatch(
    cloudFrontPathPattern: SimCloudFrontPathPattern,
    requestPath: string,
  ): TimedMatch {
    const startedAt = process.hrtime.bigint();
    const matched = cloudFrontPathPattern.matches(requestPath);

    return {
      elapsedMilliseconds: Number(process.hrtime.bigint() - startedAt) / 1e6,
      matched,
    };
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
    const { elapsedMilliseconds, matched } = timedMatch(
      cloudFrontPathPattern,
      `/${"a".repeat(32)}`,
    );

    // Then it answers that the path is a miss, and settles at once rather than
    // in the seconds a chain of wildcards takes to exhaust.
    assertFalse(matched);
    assertNumberBetween(elapsedMilliseconds, 0, 500);
  });
});
