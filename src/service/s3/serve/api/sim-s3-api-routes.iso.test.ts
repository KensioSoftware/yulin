import {
  assertIdentical,
  assertObjectEquals,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { readSimS3ApiRequest } from "./sim-s3-api-request.js";
import {
  resolveSimS3ApiRoute,
  simS3UnservedSubResource,
} from "./sim-s3-api-routes.js";

/**
 * Which S3 operation a request names, which S3 states in the method, the path
 * and a query-string sub-resource rather than in a header.
 */
describe("Resolving an S3 REST operation from a request", () => {
  function route(method: string, path: string, body = ""): string | undefined {
    const request = new Request(`http://localhost:1234${path}`, { method });

    return resolveSimS3ApiRoute(readSimS3ApiRequest(request, Buffer.from(body)))
      ?.commandName;
  }

  function input(method: string, path: string, body = ""): object | undefined {
    const request = new Request(`http://localhost:1234${path}`, { method });
    const apiRequest = readSimS3ApiRequest(request, Buffer.from(body));

    return resolveSimS3ApiRoute(apiRequest)?.input(apiRequest);
  }

  it("reads the path depth as the level the request addressed", () => {
    assertIdentical(route("GET", "/"), "ListBucketsCommand");
    assertIdentical(route("GET", "/widgets"), "ListObjectsCommand");
    assertIdentical(route("GET", "/widgets/one.txt"), "GetObjectCommand");
  });

  it("tells the two Object listings apart by the version asked for", () => {
    assertIdentical(
      route("GET", "/widgets?list-type=2"),
      "ListObjectsV2Command",
    );
    assertIdentical(route("GET", "/widgets"), "ListObjectsCommand");
  });

  it("routes a sub-resource to its own operation", () => {
    assertIdentical(route("GET", "/widgets?policy"), "GetBucketPolicyCommand");
    assertIdentical(route("PUT", "/widgets?policy"), "PutBucketPolicyCommand");
    assertIdentical(
      route("DELETE", "/widgets?policy"),
      "DeleteBucketPolicyCommand",
    );
    assertIdentical(route("PUT", "/widgets"), "CreateBucketCommand");
  });

  it("routes a HEAD to the operation that describes without reading", () => {
    assertIdentical(route("HEAD", "/widgets"), "HeadBucketCommand");
    assertIdentical(route("HEAD", "/widgets/one.txt"), "HeadObjectCommand");
  });

  it("routes a multi-Object removal, which is the one POST", () => {
    assertIdentical(route("POST", "/widgets?delete"), "DeleteObjectsCommand");
  });

  it("names no operation for a method S3 does not use here", () => {
    assertUndefined(route("PATCH", "/widgets"));
    assertUndefined(route("POST", "/widgets/one.txt"));
  });

  it("reads a key that contains slashes as one key", () => {
    assertObjectEquals(input("GET", "/widgets/nested/deeper/one.txt"), {
      Bucket: "widgets",
      Key: "nested/deeper/one.txt",
    });
  });

  it("decodes a key each segment at a time", () => {
    // Given a key whose own text contains a space and an encoded slash
    assertObjectEquals(input("GET", "/widgets/a%20b/c%2Fd"), {
      Bucket: "widgets",
      Key: "a b/c/d",
    });
  });

  it("reads listing parameters out of the query string", () => {
    assertObjectEquals(
      input("GET", "/widgets?list-type=2&prefix=a%2F&max-keys=10"),
      { Bucket: "widgets", Prefix: "a/", MaxKeys: 10 },
    );
  });

  it("leaves out a listing parameter the request did not state", () => {
    // Given a listing asking for nothing but the Bucket
    assertObjectEquals(input("GET", "/widgets?list-type=2"), {
      Bucket: "widgets",
    });
  });

  it("drops a numeric parameter that is not a number", () => {
    assertObjectEquals(input("GET", "/widgets?list-type=2&max-keys=many"), {
      Bucket: "widgets",
    });
  });

  function unserved(path: string): string | undefined {
    const request = new Request(`http://localhost:1234${path}`);

    return simS3UnservedSubResource(
      readSimS3ApiRequest(request, Buffer.alloc(0)),
    );
  }

  it("names a sub-resource it does not serve, so it can be refused", () => {
    // Given requests naming sub-resources this endpoint has no operation for
    assertIdentical(unserved("/widgets?acl"), "acl");
    assertIdentical(unserved("/widgets?versioning"), "versioning");

    // And the ones it does serve are not mistaken for it
    assertUndefined(unserved("/widgets?policy"));
  });

  it("reads a parameter left empty as a value rather than a sub-resource", () => {
    // Given the listing the CLI sends, which states an empty prefix and
    // delimiter. Reading either as a sub-resource would refuse `aws s3 ls`.
    assertUndefined(unserved("/widgets?list-type=2&prefix=&delimiter=%2F"));
    assertIdentical(
      route("GET", "/widgets?list-type=2&prefix=&delimiter=%2F"),
      "ListObjectsV2Command",
    );
  });
});
