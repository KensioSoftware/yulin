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
import { SimCloudFrontServiceController } from "./sim-cloudfront-controller.js";
import { makeCffFunctionCodeInput } from "../cff/function-code-input/cff-function-code-input.js";
import type { CloudFrontFunction } from "../typings/cloudfront-functions.namespace.js";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";

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

    const res = await new SimCloudFrontServiceController({
      simAws,
    }).handleRequest(
      {
        service: "cloudFront",
        resourceName: "",
      },
      new Request(
        `http://${distributionId}.cloudfront.net.sim-aws.localhost/index.html`,
      ),
    );

    assertResponseStatus(res, 200);
    assertIdentical(await res.text(), body);
    assertIdentical(res.headers.get("x-frame-options"), "DENY");

    const contentLength = res.headers.get("content-length");
    if (contentLength !== null) {
      assertIdentical(Number(contentLength), Buffer.byteLength(body));
    }

    assertFalse(
      res.headers.has("content-length") && res.headers.has("transfer-encoding"),
    );
  });
});
