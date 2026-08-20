import {
  assertIdentical,
  assertObjectEquals,
  assertObjectMatches,
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

  function sent(
    method: string,
    path: string,
    headers: Record<string, string>,
  ): { command: string | undefined; input: object | undefined } {
    const request = new Request(`http://localhost:1234${path}`, {
      method,
      headers,
    });
    const apiRequest = readSimS3ApiRequest(request, Buffer.alloc(0));
    const matched = resolveSimS3ApiRoute(apiRequest);

    return {
      command: matched?.commandName,
      input: matched?.input(apiRequest),
    };
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

  it("routes the six operations of a multipart upload", () => {
    // Given the requests an upload in parts is made of, which share their
    // method and path with the single-part operations and are told apart by
    // the `uploads` and `uploadId` sub-resources alone.
    assertIdentical(
      route("POST", "/widgets/big.bin?uploads"),
      "CreateMultipartUploadCommand",
    );
    assertIdentical(
      route("PUT", "/widgets/big.bin?uploadId=U1&partNumber=2"),
      "UploadPartCommand",
    );
    assertIdentical(
      route("POST", "/widgets/big.bin?uploadId=U1"),
      "CompleteMultipartUploadCommand",
    );
    assertIdentical(
      route("DELETE", "/widgets/big.bin?uploadId=U1"),
      "AbortMultipartUploadCommand",
    );
    assertIdentical(
      route("GET", "/widgets/big.bin?uploadId=U1"),
      "ListPartsCommand",
    );
    assertIdentical(
      route("GET", "/widgets?uploads"),
      "ListMultipartUploadsCommand",
    );

    // And the single-part operations they share a method and path with are
    // still reached by a request naming no sub-resource.
    assertIdentical(route("PUT", "/widgets/big.bin"), "PutObjectCommand");
    assertIdentical(route("GET", "/widgets/big.bin"), "GetObjectCommand");
    assertIdentical(route("DELETE", "/widgets/big.bin"), "DeleteObjectCommand");
  });

  it("reads which part of which upload a request carries", () => {
    // Given a part upload, whose bytes travel as the body and whose number and
    // upload travel in the query string.
    const read = input(
      "PUT",
      "/widgets/big.bin?uploadId=U1&partNumber=3",
      "the third part",
    ) as Record<string, unknown>;

    assertObjectMatches(read, {
      Bucket: "widgets",
      Key: "big.bin",
      UploadId: "U1",
      PartNumber: 3,
    });
    assertIdentical(
      Buffer.from(read["Body"] as Uint8Array).toString("utf8"),
      "the third part",
    );
  });

  it("reads the parts a completion names out of its XML body", () => {
    // Given the document the `aws` CLI sends to finish an upload.
    const body =
      `<CompleteMultipartUpload xmlns="http://s3.amazonaws.com/doc/2006-03-01/">` +
      `<Part><ETag>"aaa"</ETag><PartNumber>1</PartNumber></Part>` +
      `<Part><ETag>"bbb"</ETag><PartNumber>2</PartNumber></Part>` +
      `</CompleteMultipartUpload>`;

    assertObjectEquals(input("POST", "/widgets/big.bin?uploadId=U1", body), {
      Bucket: "widgets",
      Key: "big.bin",
      UploadId: "U1",
      MultipartUpload: {
        Parts: [
          { PartNumber: 1, ETag: '"aaa"' },
          { PartNumber: 2, ETag: '"bbb"' },
        ],
      },
    });
  });

  it("tells a copy apart from an upload by the source header", () => {
    // Given the request real S3 states a copy as, which is a PUT on the
    // destination naming the source in a header and carrying no bytes
    assertIdentical(
      sent("PUT", "/archive/2026/report.pdf", {
        "x-amz-copy-source": "/inbox/report.pdf",
      }).command,
      "CopyObjectCommand",
    );

    // And the same PUT without that header is still the upload it has always
    // been
    assertIdentical(
      route("PUT", "/archive/2026/report.pdf"),
      "PutObjectCommand",
    );
  });

  it("reads the source and the metadata directive a copy states", () => {
    // Given a copy asking for the destination's own metadata rather than the
    // source's
    assertObjectEquals(
      sent("PUT", "/archive/report.pdf", {
        "x-amz-copy-source": "/inbox/a%20b/c%2Fd.pdf",
        "x-amz-metadata-directive": "REPLACE",
        "content-type": "application/pdf",
      }).input,
      {
        Bucket: "archive",
        Key: "report.pdf",
        ContentType: "application/pdf",
        CopySource: "/inbox/a%20b/c%2Fd.pdf",
        MetadataDirective: "REPLACE",
      },
    );

    // And a copy stating neither says nothing about a directive, so the
    // operation's own default applies
    assertObjectEquals(
      sent("PUT", "/archive/report.pdf", {
        "x-amz-copy-source": "inbox/report.pdf",
      }).input,
      {
        Bucket: "archive",
        Key: "report.pdf",
        CopySource: "inbox/report.pdf",
      },
    );
  });

  it("refuses a copy into a part rather than reading it as a part upload", () => {
    // Given the UploadPartCopy the CLI sends for a file over its multipart
    // threshold, which is a part upload in every respect but the source header
    assertIdentical(
      sent("PUT", "/archive/big.bin?uploadId=U1&partNumber=2", {
        "x-amz-copy-source": "/inbox/big.bin",
      }).command,
      "UploadPartCopyCommand",
    );

    // And the part upload it looks like is still reached without that header,
    // rather than every part being refused
    assertIdentical(
      route("PUT", "/archive/big.bin?uploadId=U1&partNumber=2"),
      "UploadPartCommand",
    );
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
    assertUndefined(unserved("/widgets?uploads"));
    assertUndefined(unserved("/widgets/big.bin?uploadId=U1"));
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

  it("carries a listing's delimiter through to the operation's input", () => {
    // Given the listing `aws s3 ls s3://widgets/img/` sends, on either version
    // of the operation.
    assertObjectMatches(input("GET", "/widgets?prefix=img%2F&delimiter=%2F"), {
      Bucket: "widgets",
      Prefix: "img/",
      Delimiter: "/",
    });
    assertObjectMatches(
      input("GET", "/widgets?list-type=2&prefix=img%2F&delimiter=%2F"),
      { Bucket: "widgets", Prefix: "img/", Delimiter: "/" },
    );

    // And a listing that named no delimiter says nothing about one, rather
    // than asking for a rollup under an empty string.
    assertObjectEquals(input("GET", "/widgets?list-type=2"), {
      Bucket: "widgets",
    });
  });
});
