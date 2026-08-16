import {
  assertFalse,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  SimLogsInvalidParameterException,
  SimLogsUnsupportedOperationException,
} from "../error/sim-logs.error.js";
import { SimLogsFilterPattern } from "./sim-logs-filter-pattern.js";

describe("SimLogsFilterPattern", () => {
  it("matches everything when there is no pattern", () => {
    // Given no pattern, and an empty one.
    const none = new SimLogsFilterPattern();
    const empty = new SimLogsFilterPattern("   ");

    // Then both match any message, as an omitted filter pattern does.
    assertTrue(none.matches("anything at all"));
    assertTrue(empty.matches("anything at all"));
  });

  it("matches a term as a case sensitive substring", () => {
    // Given a single term.
    const pattern = new SimLogsFilterPattern("ERROR");

    // Then it matches a message containing it, in that case only.
    assertTrue(pattern.matches("2026-08-16 ERROR order failed"));
    assertFalse(pattern.matches("2026-08-16 error order failed"));
    assertFalse(pattern.matches("everything is fine"));
  });

  it("requires every term where several are given", () => {
    // Given two terms with nothing between them.
    const pattern = new SimLogsFilterPattern("ERROR orders");

    // Then a message has to carry both.
    assertTrue(pattern.matches("ERROR in orders service"));
    assertFalse(pattern.matches("ERROR in billing service"));
  });

  it("matches any alternative where terms are prefixed with a question mark", () => {
    // Given two alternatives.
    const pattern = new SimLogsFilterPattern("?ERROR ?WARN");

    // Then either one is enough, and neither is not.
    assertTrue(pattern.matches("ERROR order failed"));
    assertTrue(pattern.matches("WARN retrying"));
    assertFalse(pattern.matches("INFO all good"));
  });

  it("excludes a term prefixed with a hyphen", () => {
    // Given a required term and an excluded one.
    const pattern = new SimLogsFilterPattern("ERROR -Throttling");

    // Then the excluded term keeps a message out however well it otherwise
    // matches.
    assertTrue(pattern.matches("ERROR order failed"));
    assertFalse(pattern.matches("ERROR Throttling from downstream"));
  });

  it("matches a quoted phrase, spaces and all", () => {
    // Given a phrase and an escaped quote inside one.
    const phrase = new SimLogsFilterPattern('"order has no items"');
    const quoted = new SimLogsFilterPattern('"say \\"hello\\""');

    // Then the whole phrase has to appear, rather than its words separately.
    assertTrue(phrase.matches("ValidationError: order has no items"));
    assertFalse(phrase.matches("order is fine, has no problems, no items"));
    assertTrue(quoted.matches('the handler logged say "hello" once'));
  });

  it("refuses a quoted term that was never closed", () => {
    // When a pattern opens a quote and does not close it.
    const error = assertThrowsError(
      () => new SimLogsFilterPattern('"order has no items'),
    );

    // Then it is refused rather than read as whatever is left.
    assertInstanceOf(error, SimLogsInvalidParameterException);
  });

  it("refuses a term with nothing in it", () => {
    // When a prefix is given with no term after it.
    const error = assertThrowsError(() => new SimLogsFilterPattern("ERROR -"));

    // Then it is refused.
    assertInstanceOf(error, SimLogsInvalidParameterException);
  });

  it("refuses the pattern syntaxes it cannot read, rather than matching everything", () => {
    // When a JSON property pattern, a space delimited field pattern and a
    // regular expression term are given.
    const json = assertThrowsError(
      () => new SimLogsFilterPattern('{ $.level = "ERROR" }'),
    );
    const fields = assertThrowsError(
      () => new SimLogsFilterPattern("[level=ERROR, message]"),
    );
    const regex = assertThrowsError(
      () => new SimLogsFilterPattern("%ERROR|WARN%"),
    );

    // Then each says what is not supported, so a filter never silently turns
    // into one that matches any log line at all.
    assertInstanceOf(json, SimLogsUnsupportedOperationException);
    assertInstanceOf(fields, SimLogsUnsupportedOperationException);
    assertInstanceOf(regex, SimLogsUnsupportedOperationException);
    assertStringIncludes(json.message, "JSON property");
    assertStringIncludes(fields.message, "space delimited field");
    assertStringIncludes(regex.message, "regular expression");
  });
});
