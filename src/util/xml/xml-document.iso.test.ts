import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  parseXmlDocument,
  xmlBoolean,
  xmlChild,
  xmlChildren,
  xmlText,
} from "./xml-document.js";

describe("Reading an XML document", () => {
  it("reads nested elements and their text", () => {
    // Given a document with an element inside an element
    const root = parseXmlDocument(
      "<Delete><Object><Key>one.txt</Key></Object></Delete>",
    );

    // Then each level is reachable by name
    assertIdentical(root?.name, "Delete");
    assertIdentical(xmlText(xmlChild(root, "Object"), "Key"), "one.txt");
  });

  it("keeps repeated elements in document order", () => {
    // Given a document repeating one element
    const root = parseXmlDocument(
      "<Delete><Object><Key>a</Key></Object><Object><Key>b</Key></Object></Delete>",
    );

    // When every one of them is read
    const objects = xmlChildren(root, "Object");

    // Then they came back in the order they were written
    assertArrayLength(objects, 2);
    assertIdentical(xmlText(objects[0], "Key"), "a");
    assertIdentical(xmlText(objects[1], "Key"), "b");
  });

  it("reads an element that closed itself as having no children", () => {
    // Given a document with a self-closing element
    const root = parseXmlDocument(
      "<Configuration><EventBridge/><Id>one</Id></Configuration>",
    );

    // Then it is present and empty, and the element after it is a sibling
    assertArrayLength(xmlChildren(root, "EventBridge"), 1);
    assertIdentical(xmlText(root, "Id"), "one");
  });

  it("ignores the declaration, comments and attributes", () => {
    // Given a document carrying all three
    const root = parseXmlDocument(
      `<?xml version="1.0"?><!-- a note --><Config xmlns="http://s3"><Id>one</Id></Config>`,
    );

    // Then the element tree is what is left
    assertIdentical(root?.name, "Config");
    assertIdentical(xmlText(root, "Id"), "one");
  });

  it("decodes the entities XML text carries", () => {
    // Given text using named, decimal and hexadecimal references
    const root = parseXmlDocument(
      "<Key>a&amp;b &lt;c&gt; &quot;d&quot; &apos;e&apos; &#65; &#x42;</Key>",
    );

    // Then each one came back as the character it names
    assertIdentical(root?.text.trim(), `a&b <c> "d" 'e' A B`);
  });

  it("leaves a reference naming no character as it was written", () => {
    // Given a reference outside the range of a code point
    const root = parseXmlDocument("<Key>&#x110000; &notAnEntity;</Key>");

    // Then it survives rather than becoming a replacement character
    assertIdentical(root?.text.trim(), "&#x110000; &notAnEntity;");
  });

  it("reads a boolean an element states", () => {
    // Given a configuration stating two booleans
    const root = parseXmlDocument(
      "<Config><Quiet>true</Quiet><Block>false</Block></Config>",
    );

    // Then each reads back as the boolean it named, and an absent one is
    // undefined rather than false
    assertTrue(xmlBoolean(root, "Quiet"));
    assertFalse(xmlBoolean(root, "Block"));
    assertUndefined(xmlBoolean(root, "Missing"));
  });

  it("reads an empty document as no element at all", () => {
    // Given a body with nothing in it
    assertUndefined(parseXmlDocument(""));
    assertUndefined(parseXmlDocument(" ".repeat(3)));
  });

  it("ignores a closing tag that closes nothing", () => {
    // Given a malformed document, which a service answers for itself
    const root = parseXmlDocument("</Stray><Config><Id>one</Id></Config>");

    // Then what can be read is read, rather than the reader raising
    assertIdentical(xmlText(root, "Id"), "one");
  });
});
