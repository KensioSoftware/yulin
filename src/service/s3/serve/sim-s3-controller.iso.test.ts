import { assertIdentical, assertStringIncludes } from "@kensio/smartass";
import { describe, it } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { SimAws } from "../../aws/sim-aws.js";
import { SimS3ServiceController } from "./sim-s3-controller.js";
import type { SimS3BucketName } from "../bucket/s3-bucket.js";

describe("Simulated S3 local HTTP controller", () => {
  it("responds HTTP 400 for missing S3 Bucket name", async () => {
    const res = new MockServerResponse();

    await new SimS3ServiceController(new SimAws()).handleRequest(
      {
        service: "s3",
        resourceName: "",
        regionName: "eu-west-2",
      },
      mockRequest({
        method: "GET",
        host: "s3-website.eu-west-2.localhost",
        url: "/index.html",
      }),
      res.asServerResponse(),
    );

    assertIdentical(res.statusCode, 400);
    assertStringIncludes(res.body, "Missing S3 Bucket name");
  });

  it("responds HTTP 400 for missing S3 Bucket region", async () => {
    const res = new MockServerResponse();

    await new SimS3ServiceController(new SimAws()).handleRequest(
      {
        service: "s3",
        resourceName: "foo-site",
      },
      mockRequest({
        method: "GET",
        host: "foo-site.s3-website.localhost",
        url: "/index.html",
      }),
      res.asServerResponse(),
    );

    assertIdentical(res.statusCode, 400);
    assertStringIncludes(res.body, "Missing S3 Bucket region");
  });

  it("responds HTTP 400 for missing host header", async () => {
    const res = new MockServerResponse();

    await new SimS3ServiceController(new SimAws()).handleRequest(
      {
        service: "s3",
        resourceName: "foo-site",
        regionName: "eu-west-2",
      },
      mockRequest({
        method: "GET",
        host: undefined,
        url: "/index.html",
      }),
      res.asServerResponse(),
    );

    assertIdentical(res.statusCode, 400);
    assertStringIncludes(res.body, "Missing host header");
  });

  it("responds HTTP 404 when the Bucket is registered but missing from its scope", async () => {
    const simAws = new SimAws();
    const res = new MockServerResponse();

    simAws.s3GlobalRegistry().registerBucket("ghost-site" as SimS3BucketName, {
      accountId: simAws.defaultAccountId,
      regionName: "eu-west-2",
    });

    await new SimS3ServiceController(simAws).handleRequest(
      {
        service: "s3",
        resourceName: "ghost-site",
        regionName: "eu-west-2",
      },
      mockRequest({
        method: "GET",
        host: "ghost-site.s3-website.eu-west-2.localhost",
        url: "/index.html",
      }),
      res.asServerResponse(),
    );

    assertIdentical(res.statusCode, 404);
    assertStringIncludes(res.body, "S3 bucket named ghost-site not found");
  });
});

function mockRequest({
  method,
  host,
  url,
}: {
  readonly method: string;
  readonly host: string | undefined;
  readonly url: string;
}): IncomingMessage {
  return {
    method,
    url,
    headers: {
      ...(host === undefined ? {} : { host }),
    },
  } as IncomingMessage;
}

class MockServerResponse {
  public statusCode = 0;
  public headers: Record<string, string | number> = {};
  public body = "";

  asServerResponse(): ServerResponse {
    return this as unknown as ServerResponse;
  }

  writeHead(
    statusCode: number,
    headers: Record<string, string | number>,
  ): this {
    this.statusCode = statusCode;
    this.headers = headers;
    return this;
  }

  end(body?: string | Buffer): this {
    if (body !== undefined) {
      this.body = Buffer.isBuffer(body) ? body.toString("utf8") : body;
    }
    return this;
  }
}
