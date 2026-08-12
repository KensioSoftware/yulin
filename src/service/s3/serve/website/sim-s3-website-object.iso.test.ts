import {
  assertArrayLength,
  assertIdentical,
  assertObjectMatches,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimS3WebsiteObject } from "./sim-s3-website-object.js";

describe("SimS3WebsiteObject", () => {
  it("describes an Object with the system metadata it was stored with", () => {
    // Given an Object the website endpoint has read, stored as brotli with a
    // cache directive of its own.
    const object = new SimS3WebsiteObject({
      body: Buffer.from("<h1>Hello</h1>"),
      metadata: {
        "content-type": "text/html",
        "content-encoding": "br",
        "cache-control": "public, max-age=0, must-revalidate",
      },
    });

    // When the website response headers are built.
    const headers = object.headers();

    // Then the endpoint serves what S3 remembers about the Object.
    assertObjectMatches(headers, {
      "content-type": "text/html",
      "content-encoding": "br",
      "cache-control": "public, max-age=0, must-revalidate",
      "content-length": "14",
    });
  });

  it("describes an Object stored without metadata by its length alone", () => {
    // Given an Object with no stored metadata.
    const object = new SimS3WebsiteObject({ body: Buffer.from("plain") });

    // When the website response headers are built.
    const headers = object.headers();

    // Then only the length of the body is reported.
    assertIdentical(headers["content-length"], "5");
    assertArrayLength(Object.keys(headers), 1);
  });

  it("describes an Object by its entity tag and write time", () => {
    // Given an Object the website endpoint has read, with the ETag and
    // last-modified time GetObject reported for it.
    const object = new SimS3WebsiteObject({
      body: Buffer.from("plain"),
      etag: '"ac7938d40cfc2307e2bf325d28e7884e"',
      lastModified: new Date("2026-08-12T09:30:00.000Z"),
    });

    // When the website response headers are built.
    const headers = object.headers();

    // Then a browser gets what it needs to revalidate its cached copy.
    assertObjectMatches(headers, {
      etag: '"ac7938d40cfc2307e2bf325d28e7884e"',
      "last-modified": "Wed, 12 Aug 2026 09:30:00 GMT",
    });
  });
});
