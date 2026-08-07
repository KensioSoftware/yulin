import {
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertResponseStatus,
} from "@kensio/smartass";
import {
  CreateDistributionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-cloudfront";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { grantPublicObjectRead } from "../../s3/bucket/sim-s3-public-read.fixture.js";
import { SimCloudFrontServiceController } from "./sim-cloudfront-controller.js";
import { SimAwsServiceRequest } from "../../../serve/controller/sim-service-controller.js";
import { makeCffFunctionCodeInput } from "../cff/function-code-input/cff-function-code-input.js";
import type { CloudFrontFunction } from "../typings/cloudfront-functions.namespace.js";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  simCfSiteBucket,
  simCfSiteDistributionConfig,
  simCfSiteDistributionId,
  simCfSiteRequest,
} from "../../../../test/cloudfront/site-fixture.js";

describe("Simulated CloudFront local HTTP controller CFF", () => {
  it("preserves the Origin response body when a viewer-response CFF only changes headers", async () => {
    const simAws = new SimAws();
    const body = "<h1>Hello from S3</h1>";

    const simS3 = simAws.s3();
    await simS3.createBucket(
      new CreateBucketCommand({
        Bucket: "viewer-response-body-bucket",
      }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "viewer-response-body-bucket",
        Key: "index.html",
        ContentType: "text/html; charset=utf-8",
        Body: body,
      }),
    );
    await grantPublicObjectRead(simS3, "viewer-response-body-bucket");

    const cffOutput = await simAws.cloudFront().createFunction(
      new CreateFunctionCommand({
        Name: "viewer-response-preserve-body-cff",
        FunctionConfig: {
          Comment: "Viewer-response preserve body CFF",
          Runtime: "cloudfront-js-2.0",
        },
        FunctionCode: makeCffFunctionCodeInput(
          (event: CloudFrontFunction.ViewerResponseEvent) => {
            event.response.headers["x-frame-options"] = {
              value: "DENY",
            };
            return event.response;
          },
        ),
      }),
    );

    const distributionOutput = await simAws.cloudFront().createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: {
          CallerReference: "viewer-response-preserve-body",
          Comment: "Viewer-response preserve body Distribution",
          Enabled: true,
          Origins: {
            Quantity: 1,
            Items: [
              {
                Id: "site-origin",
                DomainName: "viewer-response-body-bucket.s3.amazonaws.com",
                S3OriginConfig: {
                  OriginAccessIdentity: "",
                },
              },
            ],
          },
          DefaultCacheBehavior: {
            TargetOriginId: "site-origin",
            ViewerProtocolPolicy: "allow-all",
            FunctionAssociations: {
              Quantity: 1,
              Items: [
                {
                  EventType: "viewer-response",
                  FunctionARN: cffOutput.FunctionMetadata.FunctionARN,
                },
              ],
            },
          },
        },
      }),
    );

    const distributionId = distributionOutput.Distribution?.Id;
    assertNonNullable(distributionId);

    const cfController = new SimCloudFrontServiceController({
      simAws,
    });
    const response = await cfController.handleRequest(
      new SimAwsServiceRequest({
        target: {
          service: "cloudFront",
          resourceName: "",
        },
        request: new Request(
          `http://${distributionId}.cloudfront.net.sim-aws.localhost/index.html`,
        ),
      }),
    );

    assertResponseStatus(response, 200);
    assertIdentical(await response.text(), body);
    assertIdentical(response.headers.get("x-frame-options"), "DENY");

    // The Origin sets content-length from the S3 Object body, so a
    // viewer-response CFF that only touches headers must leave it matching the
    // body it did not change, with no conflicting transfer-encoding.
    assertIdentical(
      response.headers.get("content-length"),
      String(Buffer.byteLength(body)),
    );
    assertFalse(response.headers.has("transfer-encoding"));
  });

  it("runs the viewer-response CFF on a custom error response", async () => {
    // Given a site whose 404s are answered with its own error page.
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "cff-error-page-site", {
      "404.html": "<h1>Not found</h1>",
    });

    // And a viewer-response CFF marking whatever the viewer is about to get.
    const cffOutput = await simAws.cloudFront().createFunction(
      new CreateFunctionCommand({
        Name: "error-page-marker-cff",
        FunctionConfig: {
          Comment: "Error page marker CFF",
          Runtime: "cloudfront-js-2.0",
        },
        FunctionCode: makeCffFunctionCodeInput(
          (event: CloudFrontFunction.ViewerResponseEvent) => {
            event.response.headers["x-served-status"] = {
              value: String(event.response.statusCode),
            };
            return event.response;
          },
        ),
      }),
    );

    const distributionId = await simCfSiteDistributionId(
      simAws,
      simCfSiteDistributionConfig("cff-error-page-site", {
        DefaultCacheBehavior: {
          TargetOriginId: "site-origin",
          ViewerProtocolPolicy: "allow-all",
          FunctionAssociations: {
            Quantity: 1,
            Items: [
              {
                EventType: "viewer-response",
                FunctionARN: cffOutput.FunctionMetadata.FunctionARN,
              },
            ],
          },
        },
        CustomErrorResponses: {
          Quantity: 1,
          Items: [
            {
              ErrorCode: 404,
              ResponsePagePath: "/404.html",
              ResponseCode: "404",
            },
          ],
        },
      }),
    );

    // When a page that does not exist is requested.
    const response = await simCfSiteRequest(simAws, distributionId, "/missing");

    // Then the function saw the custom error response rather than the Origin's
    // own, so the error page is what the CFF gets to act on.
    assertResponseStatus(response, 404);
    assertIdentical(await response.text(), "<h1>Not found</h1>");
    assertIdentical(response.headers.get("x-served-status"), "404");
  });
});
