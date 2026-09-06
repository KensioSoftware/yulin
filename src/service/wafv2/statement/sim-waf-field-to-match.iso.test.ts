import { assertFalse, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { simWafStatementMatches } from "../sim-wafv2.fixture.js";
import type { SimWafFieldToMatchInput } from "./sim-waf-field-to-match.type.js";
import { simWafBodyInspectionLimitBytes } from "../web-acl/sim-waf-association-config.js";
import { simWafHeaderInspectionLimitBytes } from "./sim-waf-field-content.js";
import type { SimWafStatementInput } from "./sim-waf-statement.type.js";

/**
 * A statement looking for one string in whichever field it is pointed at.
 */
function contains(
  searchString: string,
  field: SimWafFieldToMatchInput,
): SimWafStatementInput {
  return {
    ByteMatchStatement: {
      SearchString: searchString,
      PositionalConstraint: "CONTAINS",
      FieldToMatch: field,
      TextTransformations: [{ Priority: 0, Type: "NONE" }],
    },
  };
}

const encoder = new TextEncoder();

describe("SimWafV2 field to match", () => {
  it("reads the query string without its leading question mark", async () => {
    // Given a statement over the query string.
    const matches = await simWafStatementMatches(
      new SimAws().wafV2(),
      contains("debug=true", { QueryString: {} }),
    );

    // Then it matches the query string as sent.
    assertTrue(matches(new Request("https://example.test/?debug=true")));
    assertFalse(matches(new Request("https://example.test/debug=true")));
  });

  it("reads the request method", async () => {
    // Given a statement over the method.
    const matches = await simWafStatementMatches(
      new SimAws().wafV2(),
      contains("DELETE", { Method: {} }),
    );

    // Then it matches the method the request was made with.
    assertTrue(
      matches(new Request("https://example.test/", { method: "DELETE" })),
    );
    assertFalse(matches(new Request("https://example.test/")));
  });

  it("reads every query argument value", async () => {
    // Given a statement over all the query arguments.
    const matches = await simWafStatementMatches(
      new SimAws().wafV2(),
      contains("../", { AllQueryArguments: {} }),
    );

    // Then one argument holding it is enough, and the argument names are not
    // read.
    assertTrue(matches(new Request("https://example.test/?page=1&file=../x")));
    assertFalse(matches(new Request("https://example.test/?page=1")));
  });

  it("reads one query argument by name, without regard to its case", async () => {
    // Given a statement over one named query argument.
    const matches = await simWafStatementMatches(
      new SimAws().wafV2(),
      contains("../", { SingleQueryArgument: { Name: "file" } }),
    );

    // Then only that argument is read, and WAF lower cases the name on both
    // sides before comparing.
    assertTrue(matches(new Request("https://example.test/?File=../x")));
    assertFalse(matches(new Request("https://example.test/?page=../x")));
  });

  it("reads one header by name", async () => {
    // Given a statement over one named header.
    const matches = await simWafStatementMatches(
      new SimAws().wafV2(),
      contains("curl", { SingleHeader: { Name: "user-agent" } }),
    );

    // Then it matches that header and nothing else.
    assertTrue(
      matches(
        new Request("https://example.test/", {
          headers: { "user-agent": "curl/8.0" },
        }),
      ),
    );
    assertFalse(matches(new Request("https://example.test/")));
  });

  it("reads the headers a match pattern selects", async () => {
    // Given a statement over two named headers' values.
    const matches = await simWafStatementMatches(
      new SimAws().wafV2(),
      contains("suspect", {
        Headers: {
          MatchPattern: { IncludedHeaders: ["x-forwarded-for", "referer"] },
          MatchScope: "VALUE",
          OversizeHandling: "CONTINUE",
        },
      }),
    );

    // Then a header outside the pattern is not read.
    assertTrue(
      matches(
        new Request("https://example.test/", {
          headers: { referer: "https://suspect.test/" },
        }),
      ),
    );
    assertFalse(
      matches(
        new Request("https://example.test/", {
          headers: { "user-agent": "suspect" },
        }),
      ),
    );
  });

  it("reads every header but the ones a pattern excludes", async () => {
    // Given a statement over all headers except one.
    const matches = await simWafStatementMatches(
      new SimAws().wafV2(),
      contains("suspect", {
        Headers: {
          MatchPattern: { ExcludedHeaders: ["user-agent"] },
          MatchScope: "VALUE",
          OversizeHandling: "CONTINUE",
        },
      }),
    );

    // Then the excluded header is the one that cannot match.
    assertFalse(
      matches(
        new Request("https://example.test/", {
          headers: { "user-agent": "suspect" },
        }),
      ),
    );
    assertTrue(
      matches(
        new Request("https://example.test/", {
          headers: { referer: "suspect" },
        }),
      ),
    );
  });

  it("reads header names when the match scope says keys", async () => {
    // Given a statement over the header names.
    const matches = await simWafStatementMatches(
      new SimAws().wafV2(),
      contains("x-internal", {
        Headers: {
          MatchPattern: { All: {} },
          MatchScope: "KEY",
          OversizeHandling: "CONTINUE",
        },
      }),
    );

    // Then the name is what matches, whatever the value is.
    assertTrue(
      matches(
        new Request("https://example.test/", {
          headers: { "x-internal": "1" },
        }),
      ),
    );
    assertFalse(
      matches(
        new Request("https://example.test/", { headers: { "x-public": "1" } }),
      ),
    );
  });

  it("reads names and values when the match scope says all", async () => {
    // Given a statement over both sides of every header.
    const matches = await simWafStatementMatches(
      new SimAws().wafV2(),
      contains("secret", {
        Headers: {
          MatchPattern: { All: {} },
          MatchScope: "ALL",
          OversizeHandling: "CONTINUE",
        },
      }),
    );

    // Then either side matching is enough.
    assertTrue(
      matches(
        new Request("https://example.test/", { headers: { "x-secret": "1" } }),
      ),
    );
    assertTrue(
      matches(
        new Request("https://example.test/", {
          headers: { "x-note": "secret" },
        }),
      ),
    );
  });

  it("reads the cookies a request sent", async () => {
    // Given a statement over one cookie's value.
    const matches = await simWafStatementMatches(
      new SimAws().wafV2(),
      contains("stolen", {
        Cookies: {
          MatchPattern: { IncludedCookies: ["session"] },
          MatchScope: "VALUE",
          OversizeHandling: "CONTINUE",
        },
      }),
    );

    // Then the cookie header is split into its cookies and only the named one
    // is read.
    assertTrue(
      matches(
        new Request("https://example.test/", {
          headers: { cookie: "theme=dark; session=stolen" },
        }),
      ),
    );
    assertFalse(
      matches(
        new Request("https://example.test/", {
          headers: { cookie: "theme=stolen" },
        }),
      ),
    );
  });

  it("reads a query argument and a cookie that carry no value", async () => {
    // Given statements over an argument name and a cookie name.
    const waf = new SimAws().wafV2();
    const argument = await simWafStatementMatches(
      waf,
      contains("", { SingleQueryArgument: { Name: "debug" } }),
    );
    const cookie = await simWafStatementMatches(
      waf,
      contains("consent", {
        Cookies: {
          MatchPattern: { All: {} },
          MatchScope: "KEY",
          OversizeHandling: "CONTINUE",
        },
      }),
    );

    // Then each is still read, with an empty value, the way it arrived.
    assertTrue(argument(new Request("https://example.test/?debug")));
    assertTrue(
      cookie(
        new Request("https://example.test/", {
          headers: { cookie: "consent" },
        }),
      ),
    );
  });

  it("reads the headers that fit before WAF stops reading", async () => {
    // Given a statement over every header value, and a request whose headers
    // are together over the inspection limit.
    const matches = await simWafStatementMatches(
      new SimAws().wafV2(),
      contains("needle", {
        Headers: {
          MatchPattern: { All: {} },
          MatchScope: "VALUE",
          OversizeHandling: "CONTINUE",
        },
      }),
    );
    const headers = new Headers({ "x-first": "needle" });

    headers.set("x-second", "y".repeat(simWafHeaderInspectionLimitBytes));

    // Then a header WAF read before it stopped still matches.
    assertTrue(matches(new Request("https://example.test/", { headers })));
  });

  it("stops at the header that used the last of the budget", async () => {
    // Given a statement over every header value, and a first header that fills
    // the inspection limit exactly.
    const matches = await simWafStatementMatches(
      new SimAws().wafV2(),
      contains("needle", {
        Headers: {
          MatchPattern: { All: {} },
          MatchScope: "VALUE",
          OversizeHandling: "CONTINUE",
        },
      }),
    );
    const headers = new Headers({
      "x-first": "y".repeat(simWafHeaderInspectionLimitBytes),
      "x-second": "needle",
    });

    // Then the header after it is not read at all, and no empty value stands
    // in for it.
    assertFalse(matches(new Request("https://example.test/", { headers })));
  });

  it("reads the request body", async () => {
    // Given a statement over the body.
    const matches = await simWafStatementMatches(
      new SimAws().wafV2(),
      contains("DROP TABLE", { Body: { OversizeHandling: "CONTINUE" } }),
    );

    // Then the body is what matches, and a request with none matches nothing.
    assertTrue(
      matches(
        new Request("https://example.test/", { method: "POST" }),
        encoder.encode("name=x; DROP TABLE users"),
      ),
    );
    assertFalse(matches(new Request("https://example.test/")));
  });

  it("reads only as much of a body as WAF reads", async () => {
    // Given a statement over the body, and a body with the search string past
    // the point WAF stops reading.
    const matches = await simWafStatementMatches(
      new SimAws().wafV2(),
      contains("needle", { Body: { OversizeHandling: "CONTINUE" } }),
    );
    const body = encoder.encode(
      `${"x".repeat(simWafBodyInspectionLimitBytes)}needle`,
    );

    // Then it does not match, because WAF never got that far either.
    assertFalse(matches(new Request("https://example.test/"), body));
  });

  it("matches an oversize body when the rule says to", async () => {
    // Given a statement that treats a body it cannot read as a match.
    const matches = await simWafStatementMatches(
      new SimAws().wafV2(),
      contains("needle", { Body: { OversizeHandling: "MATCH" } }),
    );
    const body = encoder.encode("x".repeat(simWafBodyInspectionLimitBytes + 1));

    // Then a body over the limit matches without being looked at, which is how
    // a rule refuses to let anything past that it cannot inspect.
    assertTrue(matches(new Request("https://example.test/"), body));
  });

  it("lets an oversize body past when the rule says to", async () => {
    // Given a statement that treats a body it cannot read as no match.
    const matches = await simWafStatementMatches(
      new SimAws().wafV2(),
      contains("x", { Body: { OversizeHandling: "NO_MATCH" } }),
    );
    const body = encoder.encode("x".repeat(simWafBodyInspectionLimitBytes + 1));

    // Then it does not match, even though what it was looking for is in there.
    assertFalse(matches(new Request("https://example.test/"), body));
  });
});
