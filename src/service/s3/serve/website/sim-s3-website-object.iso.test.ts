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
    const object = new SimS3WebsiteObject(Buffer.from("<h1>Hello</h1>"), {
      "content-type": "text/html",
      "content-encoding": "br",
      "cache-control": "public, max-age=0, must-revalidate",
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
    const object = new SimS3WebsiteObject(Buffer.from("plain"), undefined);

    // When the website response headers are built.
    const headers = object.headers();

    // Then only the length of the body is reported.
    assertIdentical(headers["content-length"], "5");
    assertArrayLength(Object.keys(headers), 1);
  });
});
