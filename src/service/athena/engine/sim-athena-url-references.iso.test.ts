import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import { anAnsweredExpression } from "./sim-athena-shim.fixture.js";

const logFields = "'/reports/august?tenant=acme'";

describe("a URI reference with no scheme of its own", () => {
  it("reads the parts a CloudFront log column holds", async () => {
    // Given the path and the query a log carries, with no whole URL anywhere.
    // When each part is read.
    // Then the reference answers, the way Trino's `new URI(text)` answers.
    assertIdentical(
      await anAnsweredExpression(`url_extract_path(${logFields})`),
      "/reports/august",
    );
    assertIdentical(
      await anAnsweredExpression(`url_extract_query(${logFields})`),
      "tenant=acme",
    );
    assertIdentical(
      await anAnsweredExpression(
        `url_extract_parameter(${logFields}, 'tenant')`,
      ),
      "acme",
    );
  });

  it("answers with the empty string for the parts it has not got", async () => {
    // Given the same reference.
    // When the parts only an absolute URL carries are read.
    // Then each answers with the empty string, apart from the port. Trino
    // answers the same, since a part a URI leaves out is null and it writes a
    // null part out as empty.
    assertIdentical(
      await anAnsweredExpression(`url_extract_protocol(${logFields})`),
      "",
    );
    assertIdentical(
      await anAnsweredExpression(`url_extract_host(${logFields})`),
      "",
    );
    assertIdentical(
      await anAnsweredExpression(`url_extract_port(${logFields})`),
      null,
    );
  });

  it("reads a reference a statement built for itself", async () => {
    // Given a query joining a log's stem and query columns, which is how a
    // rollup reaches a parameter with no URL column to read.
    // When the parameter is read off what that came to.
    // Then it answers.
    assertIdentical(
      await anAnsweredExpression(
        "url_extract_parameter('/search' || '?' || 'q=1', 'q')",
      ),
      "1",
    );
  });

  it("keeps a relative path as the text wrote it", async () => {
    // Given a reference that is one path segment and nothing else.
    // When its path is read.
    // Then no leading slash is added. Trino reads the parts off the text
    // rather than resolving them against a base, and asserts this one.
    assertIdentical(
      await anAnsweredExpression("url_extract_path('foo')"),
      "foo",
    );
  });

  it("reads no path or query out of an opaque URI", async () => {
    // Given a scheme followed by something other than a slash.
    // When its parts are read.
    // Then the scheme answers and the rest are empty. Java calls this an
    // opaque URI and keeps everything after the scheme out of the path.
    assertIdentical(
      await anAnsweredExpression(
        "url_extract_protocol('mailto:test@rain.example')",
      ),
      "mailto",
    );
    assertIdentical(
      await anAnsweredExpression(
        "url_extract_path('mailto:test@rain.example')",
      ),
      "",
    );
    assertIdentical(
      await anAnsweredExpression(
        "url_extract_host('mailto:test@rain.example')",
      ),
      "",
    );
  });

  it("keeps the colons of an IPv6 literal out of the port", async () => {
    // Given a host written as an IPv6 literal, with and without a port.
    // When each is read.
    // Then the brackets stay with the host and only the port after them is a
    // port.
    assertIdentical(
      await anAnsweredExpression("url_extract_host('http://[::1]:8080/a')"),
      "[::1]",
    );
    assertIdentical(
      await anAnsweredExpression("url_extract_port('http://[::1]:8080/a')"),
      8080,
    );
    assertIdentical(
      await anAnsweredExpression("url_extract_port('http://[::1]/a')"),
      null,
    );
  });

  it("answers null over text no URI could carry", async () => {
    // Given a character RFC 2396 leaves out, and a percent naming no byte.
    // When each is read.
    // Then the answer is null, which is Trino's answer too. Its own test
    // asserts null for every part of the first of these.
    assertIdentical(
      await anAnsweredExpression("url_extract_host('http://rain.example/^')"),
      null,
    );
    assertIdentical(
      await anAnsweredExpression("url_extract_path('/reports/%zz')"),
      null,
    );
    assertIdentical(
      await anAnsweredExpression("url_extract_protocol('1rain://example/a')"),
      null,
      "a scheme starts with a letter, so this is no reference at all",
    );
  });
});
