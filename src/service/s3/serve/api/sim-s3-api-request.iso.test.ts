import { faker } from "@faker-js/faker";
import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import { readSimS3ApiRequest } from "./sim-s3-api-request.js";

/**
 * Which Bucket and Object a request named, which S3 lets a client state in
 * either the hostname or the path.
 */
describe("Reading what an S3 REST request addressed", () => {
  function addressed(url: string): { bucketName: string; objectKey: string } {
    const { bucketName, objectKey } = readSimS3ApiRequest(
      new Request(url),
      Buffer.alloc(0),
    );

    return { bucketName, objectKey };
  }

  it("reads a Bucket a client stated in the path", () => {
    // Given a request to the endpoint URL a client was given, which addresses
    // every service on one hostname and so names its Bucket in the path.
    const bucketName = faker.string.alpha({ length: 10, casing: "lower" });

    // When it is read.
    const request = addressed(
      `http://localhost:1234/${bucketName}/notes/today.txt`,
    );

    // Then the first path segment is the Bucket and the rest is the key.
    assertIdentical(request.bucketName, bucketName);
    assertIdentical(request.objectKey, "notes/today.txt");
  });

  it("reads a Bucket the SDK stated in the hostname", () => {
    // Given a request an SDK resolving S3's own endpoint sent, which puts the
    // Bucket in front of the endpoint hostname.
    const bucketName = faker.string.alpha({ length: 10, casing: "lower" });

    // When it is read.
    const request = addressed(
      `https://${bucketName}.s3.eu-west-2.amazonaws.com/notes/today.txt?x-id=GetObject`,
    );

    // Then the Bucket comes from the hostname, leaving the whole path as the
    // key rather than the first segment of it.
    assertIdentical(request.bucketName, bucketName);
    assertIdentical(request.objectKey, "notes/today.txt");
  });

  it("keeps the dots in a Bucket name the hostname spells out", () => {
    // Given a virtual host request for a Bucket whose name contains dots, so
    // that the Bucket is several hostname labels rather than one.
    const bucketName = `${faker.word.noun()}.${faker.word.noun()}`;

    // When it is read.
    const request = addressed(
      `https://${bucketName}.s3.eu-west-2.amazonaws.com/today.txt`,
    );

    // Then every label before the endpoint is part of the Bucket name.
    assertIdentical(request.bucketName, bucketName);
    assertIdentical(request.objectKey, "today.txt");
  });

  it("names no Bucket for the path-style S3 endpoint itself", () => {
    // Given a request to S3's own path-style endpoint, which carries the
    // service-level operations.
    // When it is read.
    const request = addressed("https://s3.eu-west-2.amazonaws.com/");

    // Then it names no Bucket, which is what makes it service-level.
    assertIdentical(request.bucketName, "");
    assertIdentical(request.objectKey, "");
  });
});
