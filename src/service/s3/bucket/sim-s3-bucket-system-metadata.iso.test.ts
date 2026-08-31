import {
  assertArrayEmpty,
  assertArrayLength,
  assertObjectEquals,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimS3KeyPrefixDeclaration } from "../object/s3-key-prefix-metadata.js";
import { SimS3BucketSystemMetadata } from "./sim-s3-bucket-system-metadata.js";

describe("SimS3BucketSystemMetadata", () => {
  it("keeps what each source declared", () => {
    // Given a Bucket two deployments publish into.
    const systemMetadata = new SimS3BucketSystemMetadata();

    systemMetadata.declare(
      "site",
      new SimS3KeyPrefixDeclaration({
        keyPrefix: "",
        metadata: { CacheControl: "public, max-age=0" },
      }),
    );
    systemMetadata.declare(
      "data",
      new SimS3KeyPrefixDeclaration({
        keyPrefix: "data/",
        metadata: { ContentEncoding: "br" },
      }),
    );

    // When the Bucket is asked what it has been told.
    const declarations = systemMetadata.declarations();

    // Then both are there, in the order they were made.
    assertArrayLength(declarations, 2);
    assertObjectEquals(declarations[0].metadata, {
      CacheControl: "public, max-age=0",
    });
    assertObjectEquals(declarations[1].metadata, { ContentEncoding: "br" });
  });

  it("replaces a source's declaration in the place it took", () => {
    // Given a Bucket described by two deployments.
    const systemMetadata = new SimS3BucketSystemMetadata();

    systemMetadata.declare(
      "site",
      new SimS3KeyPrefixDeclaration({
        keyPrefix: "",
        metadata: { CacheControl: "public, max-age=0" },
      }),
    );
    systemMetadata.declare(
      "data",
      new SimS3KeyPrefixDeclaration({
        keyPrefix: "data/",
        metadata: { ContentEncoding: "br" },
      }),
    );

    // When the first is deployed again with a different directive, as a
    // watching dev process redeploying a changed template.
    systemMetadata.declare(
      "site",
      new SimS3KeyPrefixDeclaration({
        keyPrefix: "",
        metadata: { CacheControl: "no-store" },
      }),
    );

    // Then it is the same one declaration saying something else, still ahead of
    // the deployment that was made after it.
    const declarations = systemMetadata.declarations();

    assertArrayLength(declarations, 2);
    assertObjectEquals(declarations[0].metadata, { CacheControl: "no-store" });
    assertObjectEquals(declarations[1].metadata, { ContentEncoding: "br" });
  });

  it("has nothing to say about a Bucket nothing has described", () => {
    // Given a Bucket no deployment has published into.
    const systemMetadata = new SimS3BucketSystemMetadata();

    // When it is asked what it has been told.
    const declarations = systemMetadata.declarations();

    // Then it says nothing, and a mount over it is on its own.
    assertArrayEmpty(declarations);
  });
});
