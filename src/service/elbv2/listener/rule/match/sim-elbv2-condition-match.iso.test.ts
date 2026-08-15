import { assertFalse, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimElbV2RuleCondition } from "../sim-elbv2-rule-condition.js";
import type { SimElbV2MatchableRequest } from "./sim-elbv2-matchable-request.js";

/**
 * A request to match a condition against, where only one part matters at a
 * time.
 */
function requestFor(
  parts: Partial<SimElbV2MatchableRequest>,
): SimElbV2MatchableRequest {
  return { host: "shop.example.com", path: "/", ...parts };
}

describe("Matching a sim ELBv2 rule condition against a request", () => {
  it("matches a path pattern against the whole path", () => {
    // Given a rule condition on a path prefix.
    const condition = SimElbV2RuleCondition.read({
      Field: "path-pattern",
      Values: ["/api/*"],
    });

    // When paths under and beside that prefix are matched.
    // Then the wildcard covers everything after the slash, including further
    // slashes, and stops at the prefix itself.
    assertTrue(condition.matches(requestFor({ path: "/api/orders" })));
    assertTrue(condition.matches(requestFor({ path: "/api/v1/orders" })));
    assertTrue(condition.matches(requestFor({ path: "/api/" })));
    assertFalse(condition.matches(requestFor({ path: "/apiv2/orders" })));
    assertFalse(condition.matches(requestFor({ path: "/orders" })));
  });

  it("does not match the bare prefix of a path pattern", () => {
    // Given the same condition, which reads as though it covers the prefix.
    const condition = SimElbV2RuleCondition.read({
      Field: "path-pattern",
      Values: ["/api/*"],
    });

    // When the prefix itself arrives, with no trailing slash.
    // Then it does not match: the pattern has a slash the path does not, and
    // the wildcard's zero characters come after it. This is the usual reason a
    // rule that looks right never claims anything, and real ELB does the same,
    // which is why a rule for both is written as ["/api", "/api/*"].
    assertFalse(condition.matches(requestFor({ path: "/api" })));

    const both = SimElbV2RuleCondition.read({
      Field: "path-pattern",
      Values: ["/api", "/api/*"],
    });

    assertTrue(both.matches(requestFor({ path: "/api" })));
    assertTrue(both.matches(requestFor({ path: "/api/orders" })));
  });

  it("matches exactly one character for a question mark", () => {
    // Given a path pattern using the single character wildcard.
    const condition = SimElbV2RuleCondition.read({
      Field: "path-pattern",
      PathPatternConfig: { Values: ["/order?"] },
    });

    // When paths of each length arrive.
    // Then only the one with exactly one character in that place matches.
    assertTrue(condition.matches(requestFor({ path: "/orders" })));
    assertFalse(condition.matches(requestFor({ path: "/order" })));
    assertFalse(condition.matches(requestFor({ path: "/orders2" })));
  });

  it("compares a path pattern with regard to case", () => {
    // Given a path pattern written in upper case.
    const condition = SimElbV2RuleCondition.read({
      Field: "path-pattern",
      Values: ["/API/*"],
    });

    // When the lower case path arrives.
    // Then it does not match, as on real ELB, where a path pattern is the case
    // sensitive condition and a host name is not.
    assertFalse(condition.matches(requestFor({ path: "/api/orders" })));
    assertTrue(condition.matches(requestFor({ path: "/API/orders" })));
  });

  it("treats everything but the two wildcards as a literal", () => {
    // Given a path pattern holding characters a regular expression would read.
    const condition = SimElbV2RuleCondition.read({
      Field: "path-pattern",
      Values: ["/prices/$1.00"],
    });

    // When a path that would match those as expression syntax arrives.
    // Then only the literal path matches, since ELB has two wildcards and no
    // other syntax.
    assertTrue(condition.matches(requestFor({ path: "/prices/$1.00" })));
    assertFalse(condition.matches(requestFor({ path: "/prices/$1x00" })));
  });

  it("matches a wildcard subdomain and not the domain under it", () => {
    // Given a host header condition on a wildcard subdomain.
    const condition = SimElbV2RuleCondition.read({
      Field: "host-header",
      Values: ["*.example.com"],
    });

    // When host names at and below that domain arrive.
    // Then the wildcard stands for the label and the dot is a literal, so the
    // bare domain does not match however many characters the wildcard covers.
    assertTrue(condition.matches(requestFor({ host: "admin.example.com" })));
    assertTrue(condition.matches(requestFor({ host: "a.b.example.com" })));
    assertFalse(condition.matches(requestFor({ host: "example.com" })));
    assertFalse(
      condition.matches(requestFor({ host: "example.com.evil.net" })),
    );
  });

  it("compares a host name without regard to case", () => {
    // Given a host header condition written in mixed case.
    const condition = SimElbV2RuleCondition.read({
      Field: "host-header",
      HostHeaderConfig: { Values: ["Shop.Example.com"] },
    });

    // When the host name arrives in another case.
    // Then it matches, as host names are case insensitive.
    assertTrue(condition.matches(requestFor({ host: "SHOP.example.com" })));
  });

  it("matches when any one of a condition's values matches", () => {
    // Given a condition carrying two host names.
    const condition = SimElbV2RuleCondition.read({
      Field: "host-header",
      Values: ["admin.example.com", "ops.example.com"],
    });

    // When each of them arrives, and one that is neither.
    // Then a value list is an or, which is what makes several conditions on a
    // rule the and.
    assertTrue(condition.matches(requestFor({ host: "admin.example.com" })));
    assertTrue(condition.matches(requestFor({ host: "ops.example.com" })));
    assertFalse(condition.matches(requestFor({ host: "shop.example.com" })));
  });
});
