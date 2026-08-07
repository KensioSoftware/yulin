import { assertArrayLength, assertObjectEquals } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimS3KeyPrefixSystemMetadata } from "./s3-key-prefix-metadata.js";

describe("SimS3KeyPrefixSystemMetadata", () => {
  it("declares system metadata for the Objects under a prefix", () => {
    // Given a compressed mirror published under its own prefix.
    const declared = new SimS3KeyPrefixSystemMetadata({
      declarations: [{ keyPrefix: "br/", metadata: { ContentEncoding: "br" } }],
    });

    // When an Object in the mirror is described.
    const headers = declared.headersForObjectKey("br/js/app.js");

    // Then it is reported as brotli, under the name a read returns it by.
    assertObjectEquals(headers, { "content-encoding": "br" });
  });

  it("leaves an Object outside the prefix undescribed", () => {
    // Given the same declaration.
    const declared = new SimS3KeyPrefixSystemMetadata({
      declarations: [{ keyPrefix: "br/", metadata: { ContentEncoding: "br" } }],
    });

    // When the uncompressed copy of the same file is described.
    const headers = declared.headersForObjectKey("js/app.js");

    // Then nothing is declared about it, so it is served as it is on disk.
    assertArrayLength(Object.keys(headers), 0);
  });

  it("declares every system metadata header a deployment can set", () => {
    // Given a declaration naming each of them.
    const declared = new SimS3KeyPrefixSystemMetadata({
      declarations: [
        {
          keyPrefix: "",
          metadata: {
            CacheControl: "public, max-age=31536000, immutable",
            ContentDisposition: 'inline; filename="app.js"',
            ContentEncoding: "br",
            ContentLanguage: "en-GB",
            ContentType: "text/javascript",
            Expires: "Sat, 02 Jan 2027 03:04:05 GMT",
          },
        },
      ],
    });

    // When an Object is described. An empty prefix is every key.
    const headers = declared.headersForObjectKey("anything.bin");

    // Then each one is reported under its header name.
    assertObjectEquals(headers, {
      "cache-control": "public, max-age=31536000, immutable",
      "content-disposition": 'inline; filename="app.js"',
      "content-encoding": "br",
      "content-language": "en-GB",
      "content-type": "text/javascript",
      expires: "Sat, 02 Jan 2027 03:04:05 GMT",
    });
  });

  it("lets a later declaration win where two name the same header", () => {
    // Given a cache directive for the whole Bucket and a longer one for the
    // hashed assets in it.
    const declared = new SimS3KeyPrefixSystemMetadata({
      declarations: [
        { keyPrefix: "", metadata: { CacheControl: "max-age=60" } },
        {
          keyPrefix: "js/",
          metadata: { CacheControl: "max-age=31536000, immutable" },
        },
      ],
    });

    // When a hashed asset is described.
    const headers = declared.headersForObjectKey("js/app.F3H4LLPU.js");

    // Then the more specific declaration is the one reported.
    assertObjectEquals(headers, {
      "cache-control": "max-age=31536000, immutable",
    });
  });

  it("declares nothing when a mount says nothing", () => {
    // Given a mount that declared no metadata at all.
    const declared = new SimS3KeyPrefixSystemMetadata();

    // When an Object is described.
    const headers = declared.headersForObjectKey("index.html");

    // Then the Object is left to be described by its file extension alone.
    assertArrayLength(Object.keys(headers), 0);
  });
});
