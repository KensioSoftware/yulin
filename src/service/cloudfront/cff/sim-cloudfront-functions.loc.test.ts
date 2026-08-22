import { afterAll, beforeAll, describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { grantPublicObjectRead } from "../../s3/bucket/sim-s3-public-read.fixture.js";
import { SimAwsLocalServer } from "../../../serve/index.js";
import {
  CreateDistributionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-cloudfront";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { assertIdentical, assertNonNullable } from "@kensio/smartass";
import { makeCffFunctionCodeInput } from "./function-code-input/cff-function-code-input.js";
import type { CloudFrontFunction } from "../typings/cloudfront-functions.namespace.js";

describe("Serve sim CloudFront Functions on localhost", () => {
  const simAws = new SimAws();

  const srv = new SimAwsLocalServer({ simAws });

  beforeAll(async () => {
    await srv.listen();
  });

  afterAll(async () => {
    await srv.close();
  });

  it("applies viewer-request CFF", async () => {
    const simS3 = simAws.s3();
    const simCloudFront = simAws.cloudFront();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "foo-bucket" }));
    await grantPublicObjectRead(simS3, "foo-bucket");

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
    const viewerRequestCffCreation = await simCloudFront.createFunction(
      new CreateFunctionCommand({
        Name: "foo-viewer-request-cff",
        FunctionConfig: {
          Comment: "Viewer Request CloudFront Function",
          Runtime: "cloudfront-js-2.0",
        },
        FunctionCode: makeCffFunctionCodeInput(viewerRequestHandlerFunction),
      }),
    );

    const distributionCreation = await simCloudFront.createDistribution(
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
                    viewerRequestCffCreation.FunctionMetadata.FunctionARN,
                },
              ],
            },
          },
        },
      }),
    );
    const distroId = distributionCreation.Distribution?.Id;
    assertNonNullable(distroId);

    const notFoundResponse = await fetch(
      `http://${distroId.toLowerCase()}.cloudfront.net.sim-aws.localhost:${srv.port}/missing.html`,
    );
    assertIdentical(notFoundResponse.status, 404);
    const redirectedResponse = await fetch(
      `http://${distroId.toLowerCase()}.cloudfront.net.sim-aws.localhost:${srv.port}/foobar/redirectme.html`,
      { redirect: "manual" },
    );
    assertIdentical(redirectedResponse.status, 302);
    assertIdentical(
      redirectedResponse.headers.get("location"),
      "https://yulin.test/redirected.html",
    );
  });

  it("gives a viewer-request CFF the Distribution domain name as its host", async () => {
    const simCloudFront = simAws.cloudFront();

    // Given a CFF that answers with the host it was given. The host is
    // reported in a header of its own, since a Location header naming a
    // hostname this simulation serves is localised on the way to the client.
    function hostReportingHandlerFunction(
      event: CloudFrontFunction.ViewerRequestEvent,
    ) {
      const host = event.request.headers["host"]?.value ?? "no-host";
      return {
        statusCode: 200,
        statusDescription: "OK",
        headers: {
          "x-cff-host": { value: host },
        },
      };
    }
    const hostCffCreation = await simCloudFront.createFunction(
      new CreateFunctionCommand({
        Name: "host-viewer-request-cff",
        FunctionConfig: {
          Comment: "Host Viewer Request CloudFront Function",
          Runtime: "cloudfront-js-2.0",
        },
        FunctionCode: makeCffFunctionCodeInput(hostReportingHandlerFunction),
      }),
    );

    const distributionCreation = await simCloudFront.createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: {
          CallerReference: "host-header-cff",
          Comment: "Host header CDN",
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
                  FunctionARN: hostCffCreation.FunctionMetadata.FunctionARN,
                },
              ],
            },
          },
        },
      }),
    );
    const distroId = distributionCreation.Distribution?.Id;
    assertNonNullable(distroId);

    // When the Distribution is requested by its CloudFront domain name.
    const distroHostResponse = await fetch(
      `http://${distroId.toLowerCase()}.cloudfront.net.sim-aws.localhost:${srv.port}/index.html`,
    );

    // Then the CFF saw the CloudFront domain name, without the local suffix
    // and without the local server port.
    assertIdentical(
      distroHostResponse.headers.get("x-cff-host"),
      `${distroId.toLowerCase()}.cloudfront.net`,
    );
  });

  it("applies viewer-response CFF", async () => {
    const simS3 = simAws.s3();
    const simCloudFront = simAws.cloudFront();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "foobar-bucket" }),
    );
    await grantPublicObjectRead(simS3, "foobar-bucket");
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "foobar-bucket",
        Key: "foobar/something.html",
        ContentType: "text/html",
        Body: "<h1>Something</h1>",
      }),
    );

    function viewerResponseHandlerFunction(
      event: CloudFrontFunction.ViewerResponseEvent,
    ) {
      event.response.headers["x-changed-by"] = { value: "foobar handler" };
      return event.response;
    }
    const viewerResponseCffCreation = await simCloudFront.createFunction(
      new CreateFunctionCommand({
        Name: "foo-viewer-response-cff",
        FunctionConfig: {
          Comment: "Viewer Response CloudFront Function",
          Runtime: "cloudfront-js-2.0",
        },
        FunctionCode: makeCffFunctionCodeInput(viewerResponseHandlerFunction),
      }),
    );

    const distributionCreation = await simCloudFront.createDistribution(
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
                  FunctionARN:
                    viewerResponseCffCreation.FunctionMetadata.FunctionARN,
                },
              ],
            },
          },
        },
      }),
    );
    const distroId = distributionCreation.Distribution?.Id;
    assertNonNullable(distroId);

    // The Object has to be there for the Origin to answer below 400. A
    // viewer-response CFF runs for an Origin error in neither CloudFront nor
    // this simulation.
    const servedResponse = await fetch(
      `http://${distroId.toLowerCase()}.cloudfront.net.sim-aws.localhost:${srv.port}/foobar/something.html`,
    );
    assertIdentical(servedResponse.status, 200);
    assertIdentical(
      servedResponse.headers.get("x-changed-by"),
      "foobar handler",
    );
  });
});
