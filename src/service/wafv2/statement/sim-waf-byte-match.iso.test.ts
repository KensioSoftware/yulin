import { assertFalse, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { simWafStatementMatches } from "../sim-wafv2.fixture.js";
import type { SimWafStatementInput } from "./sim-waf-statement.type.js";

/**
 * A byte match statement over the request path.
 */
function pathMatch(
  searchString: string,
  positionalConstraint: string,
): SimWafStatementInput {
  return {
    ByteMatchStatement: {
      SearchString: searchString,
      PositionalConstraint: positionalConstraint,
      FieldToMatch: { UriPath: {} },
      TextTransformations: [{ Priority: 0, Type: "NONE" }],
    },
  };
}

function get(path: string): Request {
  return new Request(`https://example.test${path}`);
}

describe("SimWafV2 ByteMatchStatement", () => {
  it("matches a path that is exactly the search string", async () => {
    // Given a statement matching one path exactly.
    const matches = await simWafStatementMatches(
      new SimAws().wafV2(),
      pathMatch("/admin", "EXACTLY"),
    );

    // Then only that path matches.
    assertTrue(matches(get("/admin")));
    assertFalse(matches(get("/admin/users")));
  });

  it("matches a path that starts with the search string", async () => {
    // Given a statement matching a path prefix.
    const matches = await simWafStatementMatches(
      new SimAws().wafV2(),
      pathMatch("/admin", "STARTS_WITH"),
    );

    // Then anything under that prefix matches.
    assertTrue(matches(get("/admin/users")));
    assertFalse(matches(get("/public/admin")));
  });

  it("matches a path that ends with the search string", async () => {
    // Given a statement matching a path suffix.
    const matches = await simWafStatementMatches(
      new SimAws().wafV2(),
      pathMatch(".php", "ENDS_WITH"),
    );

    // Then anything ending that way matches.
    assertTrue(matches(get("/wp-login.php")));
    assertFalse(matches(get("/wp-login.php.txt")));
  });

  it("matches a path holding the search string anywhere", async () => {
    // Given a statement matching a path fragment.
    const matches = await simWafStatementMatches(
      new SimAws().wafV2(),
      pathMatch("etc/passwd", "CONTAINS"),
    );

    // Then it matches wherever the fragment sits.
    assertTrue(matches(get("/files/../etc/passwd")));
    assertFalse(matches(get("/files/etc-passwd")));
  });

  it("matches the search string only as a word of its own", async () => {
    // Given a statement matching a word.
    const matches = await simWafStatementMatches(
      new SimAws().wafV2(),
      pathMatch("admin", "CONTAINS_WORD"),
    );

    // Then the word matches where a letter, digit or underscore does not run
    // into it, which is what stops `administrator` claiming the rule.
    assertTrue(matches(get("/admin")));
    assertTrue(matches(get("/site/admin/users")));
    assertFalse(matches(get("/administrator")));
    assertFalse(matches(get("/site_admin_users")));
  });

  it("matches a word that appears twice, once as a word", async () => {
    // Given a statement matching a word.
    const matches = await simWafStatementMatches(
      new SimAws().wafV2(),
      pathMatch("admin", "CONTAINS_WORD"),
    );

    // Then a path where the first occurrence is inside another word still
    // matches on the second.
    assertTrue(matches(get("/administrator/admin")));
  });

  it("matches without regard to case only when asked to", async () => {
    // Given one statement matching as written and one lower casing first.
    const waf = new SimAws().wafV2();
    const caseSensitive = await simWafStatementMatches(
      waf,
      pathMatch("/admin", "STARTS_WITH"),
    );
    const lowerCased = await simWafStatementMatches(waf, {
      ByteMatchStatement: {
        SearchString: "/admin",
        PositionalConstraint: "STARTS_WITH",
        FieldToMatch: { UriPath: {} },
        TextTransformations: [{ Priority: 0, Type: "LOWERCASE" }],
      },
    });

    // Then WAF's own case sensitivity is what a rule gets unless it asks for
    // a LOWERCASE transformation.
    assertFalse(caseSensitive(get("/Admin")));
    assertTrue(lowerCased(get("/Admin")));
  });

  it("matches a search string given as bytes", async () => {
    // Given a statement whose search string is the bytes the SDK sends.
    const matches = await simWafStatementMatches(new SimAws().wafV2(), {
      ByteMatchStatement: {
        SearchString: new TextEncoder().encode("/admin"),
        PositionalConstraint: "STARTS_WITH",
        FieldToMatch: { UriPath: {} },
        TextTransformations: [{ Priority: 0, Type: "NONE" }],
      },
    });

    // Then it matches what those bytes spell.
    assertTrue(matches(get("/admin")));
  });
});
