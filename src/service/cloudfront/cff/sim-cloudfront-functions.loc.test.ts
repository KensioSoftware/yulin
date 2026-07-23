import { afterAll, beforeAll, describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { SimAwsLocalServer } from "../../../serve/index.js";
import {
  CreateDistributionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-cloudfront";
import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { assertIdentical, assertNonNullable } from "@kensio/smartass";
import { makeCffFunctionCodeInput } from "./function-code-input/cff-function-code-input.js";
import type { CloudFrontFunction } from "../typings/cloudfront-functions.namespace.js";

describe("Serve sim CloudFront Functions on localhost", () => {
  const simAws = new SimAws();

  const srv = new SimAwsLocalServer({ simAws });

  beforeAll(async () => {
    await srv.listen();
  });

  afterAll(() => {
    srv.close();
  });

  it("applies viewer-request CFF", async () => {
    const simS3 = simAws.s3();
    const simCloudFront = simAws.cloudFront();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "foo-bucket" }));

    function viewerRequestHandlerFunction(
      event: CloudFrontFunction.ViewerRequestEvent,
    ) {
      if (event.request.uri.startsWith("/foobar/redirectme")) {
        return {
          statusCode: 302,
          statusDescription: "Found",
          headers: {
            location: { value: "https://yulin.test/redirected.html" },
          },
        };
      }
      return event.request;
    }
    const createViewRequestCffOut = await simCloudFront.createFunction(
      new CreateFunctionCommand({
        Name: "foo-viewer-request-cff",
        FunctionConfig: {
          Comment: "Viewer Request CloudFront Function",
          Runtime: "cloudfront-js-2.0",
        },
        FunctionCode: makeCffFunctionCodeInput(viewerRequestHandlerFunction),
      }),
    );

    const createDistroOutput = await simCloudFront.createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: {
          CallerReference: "default-behavior",
          Comment: "Foobar CDN",
          Enabled: true,
          Origins: {
            Quantity: 1,
            Items: [
              {
                Id: "foo-origin",
                DomainName: "foo-bucket.s3.amazonaws.com",
                S3OriginConfig: { OriginAccessIdentity: "" },
              },
            ],
          },
          DefaultCacheBehavior: {
            TargetOriginId: "foo-origin",
            ViewerProtocolPolicy: "allow-all",
            FunctionAssociations: {
              Quantity: 1,
              Items: [
                {
                  EventType: "viewer-request",
                  FunctionARN:
                    createViewRequestCffOut.FunctionMetadata.FunctionARN,
                },
              ],
            },
          },
        },
      }),
    );
    const distroId = createDistroOutput.Distribution?.Id;
    assertNonNullable(distroId);

    const notFoundRes = await fetch(
      `http://${distroId.toLowerCase()}.cloudfront.net.sim-aws.localhost:${srv.port}/missing.html`,
    );
    assertIdentical(notFoundRes.status, 404);
    const redirectedRes = await fetch(
      `http://${distroId.toLowerCase()}.cloudfront.net.sim-aws.localhost:${srv.port}/foobar/redirectme.html`,
      { redirect: "manual" },
    );
    assertIdentical(redirectedRes.status, 302);
    assertIdentical(
      redirectedRes.headers.get("location"),
      "https://yulin.test/redirected.html",
    );
  });

  it("applies viewer-response CFF", async () => {
    const simS3 = simAws.s3();
    const simCloudFront = simAws.cloudFront();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "foobar-bucket" }),
    );

    function viewerResponseHandlerFunction(
      event: CloudFrontFunction.ViewerResponseEvent,
    ) {
      event.response.headers["x-changed-by"] = { value: "foobar handler" };
      return event.response;
    }
    const createViewResCffOut = await simCloudFront.createFunction(
      new CreateFunctionCommand({
        Name: "foo-viewer-response-cff",
        FunctionConfig: {
          Comment: "Viewer Response CloudFront Function",
          Runtime: "cloudfront-js-2.0",
        },
        FunctionCode: makeCffFunctionCodeInput(viewerResponseHandlerFunction),
      }),
    );

    const createDistroOutput = await simCloudFront.createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: {
          CallerReference: "default-behavior",
          Comment: "Foobar CDN",
          Enabled: true,
          Origins: {
            Quantity: 1,
            Items: [
              {
                Id: "foo-origin",
                DomainName: "foobar-bucket.s3.amazonaws.com",
                S3OriginConfig: { OriginAccessIdentity: "" },
              },
            ],
          },
          DefaultCacheBehavior: {
            TargetOriginId: "foo-origin",
            ViewerProtocolPolicy: "allow-all",
            FunctionAssociations: {
              Quantity: 1,
              Items: [
                {
                  EventType: "viewer-response",
                  FunctionARN: createViewResCffOut.FunctionMetadata.FunctionARN,
                },
              ],
            },
          },
        },
      }),
    );
    const distroId = createDistroOutput.Distribution?.Id;
    assertNonNullable(distroId);

    const redirectedRes = await fetch(
      `http://${distroId.toLowerCase()}.cloudfront.net.sim-aws.localhost:${srv.port}/foobar/something.html`,
    );
    assertIdentical(redirectedRes.status, 404);
    assertIdentical(
      redirectedRes.headers.get("x-changed-by"),
      "foobar handler",
    );
  });
});
