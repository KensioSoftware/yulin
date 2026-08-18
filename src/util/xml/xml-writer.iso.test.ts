import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  escapeXmlText,
  xmlDocument,
  xmlElement,
  xmlValue,
} from "./xml-writer.js";

describe("Writing an XML document", () => {
  it("wraps content in an element", () => {
    assertIdentical(xmlElement("Key", "one.txt"), "<Key>one.txt</Key>");
  });

  it("writes no element for a value the output did not carry", () => {
    // Given a member the operation left out, which differs from an empty one
    assertIdentical(xmlValue("Prefix", undefined), "");
    assertIdentical(xmlValue("Prefix", ""), "<Prefix></Prefix>");
  });

  it("writes a timestamp as the ISO 8601 an SDK parses back", () => {
    const written = xmlValue("LastModified", new Date("2026-08-18T09:30:00Z"));

    assertIdentical(
      written,
      "<LastModified>2026-08-18T09:30:00.000Z</LastModified>",
    );
  });

  it("writes numbers and booleans as their text", () => {
    assertIdentical(xmlValue("Size", 42), "<Size>42</Size>");
    assertIdentical(
      xmlValue("IsTruncated", false),
      "<IsTruncated>false</IsTruncated>",
    );
  });

  it("escapes what would otherwise be read as markup", () => {
    // Given a key containing every character XML gives meaning to
    const escaped = escapeXmlText(`a&b<c>d"e'f`);

    assertIdentical(escaped, "a&amp;b&lt;c&gt;d&quot;e&apos;f");
  });

  it("escapes a value on the way into an element", () => {
    assertIdentical(xmlValue("Key", "a&b"), "<Key>a&amp;b</Key>");
  });

  it("writes a document with the declaration AWS sends", () => {
    const document = xmlDocument("Result", "<Id>one</Id>");

    assertIdentical(
      document,
      `<?xml version="1.0" encoding="UTF-8"?><Result><Id>one</Id></Result>`,
    );
  });
});
