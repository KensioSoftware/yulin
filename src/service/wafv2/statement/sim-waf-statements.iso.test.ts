import { CreateRegexPatternSetCommand } from "@aws-sdk/client-wafv2";
import {
  assertFalse,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import {
  SimWafInvalidParameterException,
  SimWafNonexistentItemException,
} from "../error/sim-wafv2.error.js";
import { simWafStatementMatches } from "../sim-wafv2.fixture.js";
import type { SimWafStatementInput } from "./sim-waf-statement.type.js";

/**
 * A byte match statement over the request path.
 */
function pathIs(searchString: string): SimWafStatementInput {
  return {
    ByteMatchStatement: {
      SearchString: searchString,
      PositionalConstraint: "STARTS_WITH",
      FieldToMatch: { UriPath: {} },
      TextTransformations: [{ Priority: 0, Type: "NONE" }],
    },
  };
}

/**
 * A byte match statement over one header.
 */
function headerIs(name: string, value: string): SimWafStatementInput {
  return {
    ByteMatchStatement: {
      SearchString: value,
      PositionalConstraint: "EXACTLY",
      FieldToMatch: { SingleHeader: { Name: name } },
      TextTransformations: [{ Priority: 0, Type: "NONE" }],
    },
  };
}

function get(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`https://example.test${path}`, { headers });
}

describe("SimWafV2 statement kinds", () => {
  it("matches a regular expression anywhere in a field", async () => {
    // Given a statement over a regular expression.
    const matches = await simWafStatementMatches(new SimAws().wafV2(), {
      RegexMatchStatement: {
        RegexString: String.raw`/wp-(login|admin)\.php`,
        FieldToMatch: { UriPath: {} },
        TextTransformations: [{ Priority: 0, Type: "NONE" }],
      },
    });

    // Then a path the expression finds matches, and one it does not, does not.
    assertTrue(matches(get("/wp-login.php")));
    assertTrue(matches(get("/blog/wp-admin.php")));
    assertFalse(matches(get("/wp-content/themes")));
  });

  it("refuses a regular expression that will not compile", async () => {
    // Given a simulated WAFv2.
    const waf = new SimAws().wafV2();

    // When a rule carries an expression that is not one.
    const error = await assertThrowsErrorAsync(async () => {
      await simWafStatementMatches(waf, {
        RegexMatchStatement: {
          RegexString: "(unclosed",
          FieldToMatch: { UriPath: {} },
          TextTransformations: [{ Priority: 0, Type: "NONE" }],
        },
      });
    });

    // Then it is refused where the rule was written rather than matching
    // nothing when a request arrives.
    assertInstanceOf(error, SimWafInvalidParameterException);
  });

  it("matches any expression in a regex pattern set", async () => {
    // Given a regex pattern set with two expressions in it.
    const waf = new SimAws().wafV2();
    const created = await waf.createRegexPatternSet(
      new CreateRegexPatternSetCommand({
        Name: "bad-agents",
        Scope: "REGIONAL",
        RegularExpressionList: [
          { RegexString: "sqlmap" },
          { RegexString: "nikto" },
        ],
      }),
    );

    assertNonNullable(created.Summary);

    // When a rule points at it.
    const matches = await simWafStatementMatches(waf, {
      RegexPatternSetReferenceStatement: {
        ARN: created.Summary.ARN,
        FieldToMatch: { SingleHeader: { Name: "user-agent" } },
        TextTransformations: [{ Priority: 0, Type: "NONE" }],
      },
    });

    // Then either expression matching is enough.
    assertTrue(matches(get("/", { "user-agent": "sqlmap/1.7" })));
    assertTrue(matches(get("/", { "user-agent": "nikto" })));
    assertFalse(matches(get("/", { "user-agent": "curl/8.0" })));
  });

  it("refuses a rule pointing at a regex pattern set that is not there", async () => {
    // Given a simulated WAFv2 with no pattern sets in it.
    const waf = new SimAws().wafV2();

    // When a rule points at one by ARN anyway.
    const error = await assertThrowsErrorAsync(async () => {
      await simWafStatementMatches(waf, {
        RegexPatternSetReferenceStatement: {
          ARN: "arn:aws:wafv2:eu-west-2:111111111111:regional/regexpatternset/x/y",
          FieldToMatch: { UriPath: {} },
          TextTransformations: [{ Priority: 0, Type: "NONE" }],
        },
      });
    });

    // Then the web ACL is refused, as real WAF refuses one naming a resource
    // that does not exist.
    assertInstanceOf(error, SimWafNonexistentItemException);
  });

  it("matches on the size of a field in bytes", async () => {
    // Given a statement over the size of the request body.
    const matches = await simWafStatementMatches(new SimAws().wafV2(), {
      SizeConstraintStatement: {
        ComparisonOperator: "GT",
        Size: 8,
        FieldToMatch: { Body: { OversizeHandling: "CONTINUE" } },
        TextTransformations: [{ Priority: 0, Type: "NONE" }],
      },
    });
    const encoder = new TextEncoder();
    const sending = (body: string): boolean =>
      matches(
        new Request("https://example.test/", { method: "POST" }),
        encoder.encode(body),
      );

    // Then the byte length decides, not the character count: five Greek
    // letters are ten bytes and are over a limit eight characters are under.
    assertTrue(sending("123456789"));
    assertFalse(sending("12345678"));
    assertTrue(sending("ααααα"));
  });

  it("compares a size every way WAF compares one", async () => {
    // Given statements using each comparison against a five byte path.
    const waf = new SimAws().wafV2();
    const compares = await Promise.all(
      ["EQ", "NE", "LE", "LT", "GE"].map(
        async (operator) =>
          await simWafStatementMatches(waf, {
            SizeConstraintStatement: {
              ComparisonOperator: operator,
              Size: 5,
              FieldToMatch: { UriPath: {} },
              TextTransformations: [{ Priority: 0, Type: "NONE" }],
            },
          }),
      ),
    );

    // Then each answers about `/blog` as arithmetic says it should.
    const [equal, notEqual, atMost, lessThan, atLeast] = compares;

    assertTrue(equal?.(get("/blog")));
    assertFalse(notEqual?.(get("/blog")));
    assertTrue(atMost?.(get("/blog")));
    assertFalse(lessThan?.(get("/blog")));
    assertTrue(atLeast?.(get("/blog")));
  });

  it("matches when every statement of an AndStatement matches", async () => {
    // Given a statement joining two.
    const matches = await simWafStatementMatches(new SimAws().wafV2(), {
      AndStatement: {
        Statements: [pathIs("/admin"), headerIs("x-role", "guest")],
      },
    });

    // Then both have to match.
    assertTrue(matches(get("/admin", { "x-role": "guest" })));
    assertFalse(matches(get("/admin", { "x-role": "staff" })));
    assertFalse(matches(get("/public", { "x-role": "guest" })));
  });

  it("matches when any statement of an OrStatement matches", async () => {
    // Given a statement joining two.
    const matches = await simWafStatementMatches(new SimAws().wafV2(), {
      OrStatement: {
        Statements: [pathIs("/admin"), pathIs("/internal")],
      },
    });

    // Then either matching is enough.
    assertTrue(matches(get("/admin")));
    assertTrue(matches(get("/internal")));
    assertFalse(matches(get("/public")));
  });

  it("matches the requests a NotStatement's statement does not", async () => {
    // Given a statement over the absence of a header, nested inside an And.
    const matches = await simWafStatementMatches(new SimAws().wafV2(), {
      AndStatement: {
        Statements: [
          pathIs("/internal"),
          { NotStatement: { Statement: headerIs("x-role", "staff") } },
        ],
      },
    });

    // Then the internal path is claimed for everyone but staff, which is what
    // nesting the three together is for.
    assertTrue(matches(get("/internal", { "x-role": "guest" })));
    assertFalse(matches(get("/internal", { "x-role": "staff" })));
    assertFalse(matches(get("/public", { "x-role": "guest" })));
  });

  it("refuses an AndStatement with nothing to join", async () => {
    // Given a simulated WAFv2.
    const waf = new SimAws().wafV2();

    // When one rule joins an empty list of statements and another leaves the
    // list out altogether.
    const empty = await assertThrowsErrorAsync(async () => {
      await simWafStatementMatches(waf, { AndStatement: { Statements: [] } });
    });
    const absent = await assertThrowsErrorAsync(async () => {
      await simWafStatementMatches(waf, { AndStatement: {} });
    });

    // Then both are refused rather than claiming every request, which is what
    // an empty `every` would do.
    assertInstanceOf(empty, SimWafInvalidParameterException);
    assertInstanceOf(absent, SimWafInvalidParameterException);
    assertStringIncludes(empty.message, "statements to join");
    assertStringIncludes(absent.message, "has 0");
  });

  it.each([
    ["AndStatement", { AndStatement: { Statements: [pathIs("/admin")] } }],
    ["OrStatement", { OrStatement: { Statements: [pathIs("/admin")] } }],
  ] as const)(
    "refuses a %s joining only one statement",
    async (kind, statement) => {
      // Given a simulated WAFv2.
      const waf = new SimAws().wafV2();

      // When a rule joins a single statement.
      const error = await assertThrowsErrorAsync(async () => {
        await simWafStatementMatches(waf, statement);
      });

      // Then it is refused, as real WAF refuses the whole web ACL for it. A
      // rule evaluating the one statement would pass a shape no deployment
      // takes.
      assertInstanceOf(error, SimWafInvalidParameterException);
      assertStringIncludes(error.message, `An ${kind} needs at least two`);
      assertStringIncludes(error.message, "has 1");
    },
  );

  it("refuses a NotStatement with nothing to negate", async () => {
    // Given a simulated WAFv2.
    const waf = new SimAws().wafV2();

    // When a rule negates a statement it left out.
    const error = await assertThrowsErrorAsync(async () => {
      await simWafStatementMatches(waf, { NotStatement: {} });
    });

    // Then the refusal names the NotStatement, which is where the reader has
    // to go and look.
    assertInstanceOf(error, SimWafInvalidParameterException);
    assertStringIncludes(error.message, "NotStatement needs the one statement");
  });

  it("refuses a rule whose statement names no kind", async () => {
    // Given a simulated WAFv2.
    const waf = new SimAws().wafV2();

    // When a rule carries an empty statement.
    const error = await assertThrowsErrorAsync(async () => {
      await simWafStatementMatches(waf, {});
    });

    // Then it is refused rather than matching nothing.
    assertInstanceOf(error, SimWafInvalidParameterException);
    assertStringIncludes(error.message, "no statement kind");
  });
});
