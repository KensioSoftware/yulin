import { assertIdentical, assertStringIncludes } from "@kensio/smartass";
import { describe, it } from "vitest";
import type { ServerResponse } from "node:http";
import { SimAws } from "../../aws/sim-aws.js";
import { SimS3ServiceController } from "./sim-s3-controller.js";
import type { SimS3BucketName } from "../bucket/s3-bucket.js";
import { SimAwsHttpResponse } from "../../../serve/http/sim-aws-req-res.js";
import { makeSimAwsHttpRequest } from "../../../serve/http/sim-aws-req-res.factory.js";

describe("Simulated S3 local HTTP controller", () => {
  it("responds HTTP 400 for missing S3 Bucket name", async () => {
    const res = new MockServerResponse();

    await new SimS3ServiceController(new SimAws()).handleRequest(
      {
        service: "s3",
        resourceName: "",
        regionName: "eu-west-2",
      },
      makeSimAwsHttpRequest({
        method: "GET",
        host: "s3-website.eu-west-2.localhost",
        url: "/index.html",
      }),
      mockResponse(res),
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
      makeSimAwsHttpRequest({
        method: "GET",
        host: "foo-site.s3-website.localhost",
        url: "/index.html",
      }),
      mockResponse(res),
    );

    assertIdentical(res.statusCode, 400);
    assertStringIncludes(res.body, "Missing S3 Bucket region");
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
      makeSimAwsHttpRequest({
        method: "GET",
        host: "ghost-site.s3-website.eu-west-2.localhost",
        url: "/index.html",
      }),
      mockResponse(res),
    );

    assertIdentical(res.statusCode, 404);
    assertStringIncludes(res.body, "S3 bucket named ghost-site not found");
  });
});

function mockResponse(response: MockServerResponse): SimAwsHttpResponse {
  return new SimAwsHttpResponse(response.asServerResponse());
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
