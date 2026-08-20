import { assertFalse, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import {
  type SimWafStatementMatch,
  simWafStatementMatches,
} from "../sim-wafv2.fixture.js";
import type { SimWafStatementInput } from "./sim-waf-statement.type.js";
import type { SimWafTextTransformationInput } from "./sim-waf-text-transformation.js";

/**
 * A statement looking for one string in the request body, after the given
 * transformations.
 *
 * The body is the field here because it carries whatever bytes a test sends.
 * A URL drops tabs and newlines and cuts a value off at a `#`, so a query
 * string could not carry the input these transformations exist for.
 */
function transformed(
  searchString: string,
  transformations: readonly SimWafTextTransformationInput[],
): SimWafStatementInput {
  return {
    ByteMatchStatement: {
      SearchString: searchString,
      PositionalConstraint: "CONTAINS",
      FieldToMatch: { Body: { OversizeHandling: "CONTINUE" } },
      TextTransformations: transformations,
    },
  };
}

const encoder = new TextEncoder();

/**
 * Whether a statement claims a request carrying one body.
 */
function sending(matches: SimWafStatementMatch, body: string): boolean {
  return matches(
    new Request("https://example.test/", { method: "POST" }),
    encoder.encode(body),
  );
}

describe("SimWafV2 text transformations", () => {
  it("reads a field as it arrived under NONE", async () => {
    // Given a statement that transforms nothing.
    const matches = await simWafStatementMatches(
      new SimAws().wafV2(),
      transformed("%2e%2e%2f", [{ Priority: 0, Type: "NONE" }]),
    );

    // Then the field is compared as it was sent.
    assertTrue(sending(matches, "path=%2e%2e%2f"));
  });

  it("lower cases a field", async () => {
    // Given a statement that lower cases first.
    const matches = await simWafStatementMatches(
      new SimAws().wafV2(),
      transformed("select", [{ Priority: 0, Type: "LOWERCASE" }]),
    );

    // Then a value in any case matches.
    assertTrue(sending(matches, "q=SELECT"));
  });

  it("decodes percent escapes and plus signs", async () => {
    // Given a statement that URL decodes first.
    const waf = new SimAws().wafV2();
    const matches = await simWafStatementMatches(
      waf,
      transformed("../etc/passwd", [{ Priority: 0, Type: "URL_DECODE" }]),
    );
    const spaced = await simWafStatementMatches(
      waf,
      transformed("one two", [{ Priority: 0, Type: "URL_DECODE" }]),
    );

    // Then an escaped traversal matches the plain one it decodes to, and a
    // plus sign decodes to a space as it does in a form encoded value.
    assertTrue(sending(matches, "file=%2e%2e%2fetc%2fpasswd"));
    assertTrue(sending(spaced, "q=one+two"));
  });

  it("leaves an escape that decodes to nothing as it stands", async () => {
    // Given a statement that URL decodes first.
    const matches = await simWafStatementMatches(
      new SimAws().wafV2(),
      transformed("%e0", [{ Priority: 0, Type: "URL_DECODE" }]),
    );

    // Then a malformed escape is still inspected rather than throwing the
    // whole match away, which would be a way past the rule.
    assertTrue(sending(matches, "q=%e0"));
  });

  it("collapses whitespace to single spaces", async () => {
    // Given a statement that compresses whitespace first.
    const matches = await simWafStatementMatches(
      new SimAws().wafV2(),
      transformed("union select", [
        { Priority: 0, Type: "COMPRESS_WHITE_SPACE" },
      ]),
    );

    // Then tabs, newlines and runs of spaces all read as one space, which is
    // what stops whitespace being used to break the search string up.
    assertTrue(sending(matches, "q=union\t\n   select"));
  });

  it("decodes HTML entities, named and numbered", async () => {
    // Given a statement that decodes HTML entities first.
    const matches = await simWafStatementMatches(
      new SimAws().wafV2(),
      transformed("<script>", [{ Priority: 0, Type: "HTML_ENTITY_DECODE" }]),
    );

    // Then either spelling of an entity decodes to the character it names.
    assertTrue(sending(matches, "q=&lt;script&gt;"));
    assertTrue(sending(matches, "q=&#60;script&#x3e;"));
  });

  it("leaves an entity it does not know as it stands", async () => {
    // Given a statement that decodes HTML entities first.
    const matches = await simWafStatementMatches(
      new SimAws().wafV2(),
      transformed("&dagger;", [{ Priority: 0, Type: "HTML_ENTITY_DECODE" }]),
    );

    // Then an entity outside the set WAF decodes stays in the value.
    assertTrue(sending(matches, "q=&dagger;"));
  });

  it("leaves a code point outside Unicode as it stands", async () => {
    // Given a statement that decodes HTML entities first.
    const matches = await simWafStatementMatches(
      new SimAws().wafV2(),
      transformed("&#x110000;", [{ Priority: 0, Type: "HTML_ENTITY_DECODE" }]),
    );

    // Then a numbered entity naming no character is not decoded.
    assertTrue(sending(matches, "q=&#x110000;"));
  });

  it("applies transformations in ascending priority", async () => {
    // Given two statements with the same transformations in the two orders,
    // looking for a string only one order can produce.
    const waf = new SimAws().wafV2();
    const decodeThenLower = await simWafStatementMatches(
      waf,
      transformed("select", [
        { Priority: 1, Type: "LOWERCASE" },
        { Priority: 0, Type: "URL_DECODE" },
      ]),
    );
    const lowerThenDecode = await simWafStatementMatches(
      waf,
      transformed("select", [
        { Priority: 0, Type: "LOWERCASE" },
        { Priority: 1, Type: "URL_DECODE" },
      ]),
    );

    // Then priority decides, not the order the list was written in: lower
    // casing `%53ELECT` before decoding leaves `%53elect`, which decodes to
    // `Select` and does not match.
    assertTrue(sending(decodeThenLower, "q=%53ELECT"));
    assertFalse(sending(lowerThenDecode, "q=%53ELECT"));
  });
});
