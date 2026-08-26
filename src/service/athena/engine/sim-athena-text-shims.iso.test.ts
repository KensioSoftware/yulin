import { assertIdentical, assertThrowsErrorAsync } from "@kensio/smartass";
import { describe, it } from "vitest";

import { anAnsweredExpression } from "./sim-athena-shim.fixture.js";

const logLine = "'https://rain.example:8443/reports/august?tenant=acme#top'";

describe("Trino's regular expression functions on SQLite", () => {
  it("takes the first match or the group a call names", async () => {
    // Given a value carrying letters and digits.
    // When each is extracted.
    // Then the groups count from one and the whole match is zero, which is
    // what a regular expression counts them as anywhere.
    assertIdentical(
      await anAnsweredExpression(
        String.raw`regexp_extract('abc123', '([a-z]+)(\d+)')`,
      ),
      "abc123",
    );
    assertIdentical(
      await anAnsweredExpression(
        String.raw`regexp_extract('abc123', '([a-z]+)(\d+)', 2)`,
      ),
      "123",
    );
    assertIdentical(
      await anAnsweredExpression(String.raw`regexp_extract('abc', '(\d+)', 1)`),
      null,
    );
  });

  it("replaces every match, writing the groups back in", async () => {
    // Given a value with two matches in it.
    // When each is replaced and then removed.
    // Then `$1` reaches the capture group, and a call naming no replacement
    // takes the matches out.
    assertIdentical(
      await anAnsweredExpression(
        String.raw`regexp_replace('a1b2', '(\d)', '<$1>')`,
      ),
      "a<1>b<2>",
    );
    assertIdentical(
      await anAnsweredExpression(String.raw`regexp_replace('a1b2', '\d')`),
      "ab",
    );
  });

  it("refuses a capture group the pattern has not got", async () => {
    // Given a pattern with one group.
    // When a group outside it is asked for.
    // Then the statement raises, which leaves the declared result to answer.
    // A negative index would otherwise count back from the end and answer.
    await assertThrowsErrorAsync(async () =>
      anAnsweredExpression("regexp_extract('abc', '(a)', 5)"),
    );
    await assertThrowsErrorAsync(async () =>
      anAnsweredExpression("regexp_extract('abc', '(a)(b)', -1)"),
    );
    assertIdentical(
      await anAnsweredExpression("regexp_extract('abc', '(a)(b)', 2)"),
      "b",
    );
    assertIdentical(
      await anAnsweredExpression("regexp_extract('xyz', '(a)', 1)"),
      null,
    );
  });

  it("writes a replacement the way Trino writes one", async () => {
    // Given replacements naming a group by name and escaping a dollar.
    // When each is used.
    // Then Trino's Java spelling is what reads, since a statement written for
    // Athena carries that one. JavaScript spells both differently and would
    // leave them as literal text.
    // Written by hand rather than as a template, because `${` is Trino's own
    // spelling here and a template literal would read it as an interpolation.
    const reference = `$\u{7B}first}`;
    const named = `regexp_replace('abc', '(?<first>a)', '[${reference}]')`;
    const dollar = String.raw`regexp_replace('abc', 'a', '\$')`;

    assertIdentical(await anAnsweredExpression(named), "[a]bc");
    assertIdentical(await anAnsweredExpression(dollar), "$bc");
  });

  it("tells an argument left out from one written as NULL", async () => {
    // Given calls leaving the last argument out and calls writing it as NULL.
    // When each runs.
    // Then the absent one takes the default and the NULL answers null, the
    // way every Trino function answers a null argument.
    assertIdentical(
      await anAnsweredExpression("regexp_extract('abc', 'a')"),
      "a",
    );
    assertIdentical(
      await anAnsweredExpression("regexp_extract('abc', 'a', NULL)"),
      null,
    );
    assertIdentical(
      await anAnsweredExpression("regexp_replace('abc', 'a')"),
      "bc",
    );
    assertIdentical(
      await anAnsweredExpression("regexp_replace('abc', 'a', NULL)"),
      null,
    );
  });

  it("answers null over a pattern it cannot read", async () => {
    // Given a pattern that is no pattern.
    // When it is used.
    // Then the answer is null rather than a failed query. Trino fails.
    assertIdentical(
      await anAnsweredExpression("regexp_extract('abc', '(')"),
      null,
    );
    assertIdentical(
      await anAnsweredExpression("regexp_replace('abc', '(', 'x')"),
      null,
    );
    assertIdentical(
      await anAnsweredExpression("regexp_replace(NULL, 'a')"),
      null,
    );
    assertIdentical(
      await anAnsweredExpression("regexp_extract(NULL, 'a')"),
      null,
    );
    assertIdentical(
      await anAnsweredExpression("regexp_extract('abc', NULL)"),
      null,
    );
    assertIdentical(
      await anAnsweredExpression("regexp_like('abc', NULL)"),
      null,
    );
  });
});

describe("Trino's URL functions on SQLite", () => {
  it("reads each part of a URL", async () => {
    // Given one URL carrying every part.
    // When each part is read.
    // Then none of them keeps the punctuation that introduced it.
    assertIdentical(
      await anAnsweredExpression(`url_extract_host(${logLine})`),
      "rain.example",
    );
    assertIdentical(
      await anAnsweredExpression(`url_extract_path(${logLine})`),
      "/reports/august",
    );
    assertIdentical(
      await anAnsweredExpression(`url_extract_protocol(${logLine})`),
      "https",
    );
    assertIdentical(
      await anAnsweredExpression(`url_extract_query(${logLine})`),
      "tenant=acme",
    );
    assertIdentical(
      await anAnsweredExpression(`url_extract_fragment(${logLine})`),
      "top",
    );
    assertIdentical(
      await anAnsweredExpression(`url_extract_port(${logLine})`),
      8443,
    );
    assertIdentical(
      await anAnsweredExpression(`url_extract_parameter(${logLine}, 'tenant')`),
      "acme",
    );
  });

  it("answers nothing for a part the URL left out", async () => {
    // Given a URL carrying no port, no query and no fragment.
    // When each is read.
    // Then the port answers null, since a port has no empty form, and the
    // rest answer with the empty string Trino answers with.
    assertIdentical(
      await anAnsweredExpression("url_extract_port('https://rain.example/a')"),
      null,
    );
    assertIdentical(
      await anAnsweredExpression(
        "url_extract_port('http://rain.example:80/a')",
      ),
      80,
      "a port written out is a port, though it is the scheme's own default",
    );
    assertIdentical(
      await anAnsweredExpression(
        "url_extract_port('http://user:1234@rain.example/a')",
      ),
      null,
      "the digits in a user's own credentials are no port",
    );
    assertIdentical(
      await anAnsweredExpression("url_extract_query('https://rain.example/a')"),
      "",
    );
    assertIdentical(
      await anAnsweredExpression(
        "url_extract_parameter('https://rain.example/a?x=1', 'y')",
      ),
      null,
    );
  });

  it("answers null over text that is no URL", async () => {
    // Given text nobody could read as a URL.
    // When its host is read.
    // Then the answer is null rather than a failed query. Trino fails.
    assertIdentical(
      await anAnsweredExpression("url_extract_host('rain dot example')"),
      null,
    );
    assertIdentical(await anAnsweredExpression("url_extract_host(NULL)"), null);
    assertIdentical(await anAnsweredExpression("url_extract_port(NULL)"), null);
    assertIdentical(
      await anAnsweredExpression("url_extract_parameter(NULL, 'x')"),
      null,
    );
    assertIdentical(
      await anAnsweredExpression(
        "url_extract_parameter('https://rain.example/a', NULL)",
      ),
      null,
    );
  });
});

describe("the string functions SQLite already carries", () => {
  it("counts from one, as Trino does", async () => {
    // Given a value and a format string.
    // When `substr` and `format` are called.
    // Then SQLite's own answer is Trino's answer, so neither is shimmed.
    // Shadowing either would replace something that works.
    assertIdentical(
      await anAnsweredExpression("substr('abcdef', 2, 3)"),
      "bcd",
    );
    assertIdentical(await anAnsweredExpression("substr('abcdef', -2)"), "ef");
    assertIdentical(
      await anAnsweredExpression("format('%s has %d', 'rain', 4)"),
      "rain has 4",
    );
  });
});
