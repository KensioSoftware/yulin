import {
  assertStringIncludes,
  assertStringNotIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { simS3ListObjectsXml } from "./sim-s3-api-listing.js";

/**
 * The document an Object listing answers with, which the SDK and the `aws` CLI
 * both read a folder tree out of.
 */
describe("Writing an S3 Object listing as XML", () => {
  it("writes each rolled-up folder as its own CommonPrefixes element", () => {
    // Given a listing that rolled two folders up and kept one key.
    const output = {
      Name: "widgets",
      Delimiter: "/",
      MaxKeys: 1000,
      KeyCount: 3,
      Contents: [{ Key: "index.html", Size: 10 }],
      CommonPrefixes: [{ Prefix: "img/" }, { Prefix: "js/" }],
    };

    // When it is written.
    const xml = simS3ListObjectsXml(output, 2);

    // Then each folder is its own element, as real S3 writes them, rather than
    // one element holding both.
    assertStringIncludes(
      xml,
      "<CommonPrefixes><Prefix>img/</Prefix></CommonPrefixes>",
    );
    assertStringIncludes(
      xml,
      "<CommonPrefixes><Prefix>js/</Prefix></CommonPrefixes>",
    );
    assertStringIncludes(xml, "<Delimiter>/</Delimiter>");
    assertStringIncludes(xml, "<Key>index.html</Key>");
  });

  it("writes no delimiter or folders for a listing that had neither", () => {
    // Given a flat listing.
    const output = {
      Name: "widgets",
      MaxKeys: 1000,
      Contents: [{ Key: "index.html", Size: 10 }],
    };

    // When it is written.
    const xml = simS3ListObjectsXml(output, 1);

    // Then the elements are absent rather than empty, which is the difference
    // between a listing that rolled nothing up and one that rolled up nothing.
    assertStringNotIncludes(xml, "CommonPrefixes");
    assertStringNotIncludes(xml, "Delimiter");
  });
});
