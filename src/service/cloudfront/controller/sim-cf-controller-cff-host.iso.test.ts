import { assertIdentical, assertNonNullable } from "@kensio/smartass";
import {
  CreateDistributionCommand,
  CreateFunctionCommand,
  type FunctionAssociation,
} from "@aws-sdk/client-cloudfront";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { SimCloudFrontServiceController } from "./sim-cloudfront-controller.js";
import { SimAwsServiceRequest } from "../../../serve/controller/sim-service-controller.js";
import { makeCffFunctionCodeInput } from "../cff/function-code-input/cff-function-code-input.js";
import type { CloudFrontFunction } from "../typings/cloudfront-functions.namespace.js";

interface HostCffHandlers {
  readonly viewerRequest: CloudFrontFunction.Handler;
  readonly viewerResponse?: CloudFrontFunction.Handler;
}

/**
 * Make a Distribution serving a Bucket through the given CFF handlers.
 */
async function makeHostCffDistribution(
  simAws: SimAws,
  handlers: HostCffHandlers,
): Promise<string> {
  const simCloudFront = simAws.cloudFront();

  await simAws.s3().createBucket(
    new CreateBucketCommand({
      Bucket: "cff-host-bucket",
    }),
  );
  await simAws.s3().putObject(
    new PutObjectCommand({
      Bucket: "cff-host-bucket",
      Key: "index.html",
      Body: "<h1>From the Origin</h1>",
    }),
  );

  const cffOutput = await simCloudFront.createFunction(
    new CreateFunctionCommand({
      Name: "cff-host-viewer-request",
      FunctionConfig: {
        Comment: "Host header viewer-request CFF",
        Runtime: "cloudfront-js-2.0",
      },
      FunctionCode: makeCffFunctionCodeInput(handlers.viewerRequest),
    }),
  );

  const functionAssociations: FunctionAssociation[] = [
    {
      EventType: "viewer-request",
      FunctionARN: cffOutput.FunctionMetadata.FunctionARN,
    },
  ];

  if (handlers.viewerResponse !== undefined) {
    const viewerResponseOutput = await simCloudFront.createFunction(
      new CreateFunctionCommand({
        Name: "cff-host-viewer-response",
        FunctionConfig: {
          Comment: "Host header viewer-response CFF",
          Runtime: "cloudfront-js-2.0",
        },
        FunctionCode: makeCffFunctionCodeInput(handlers.viewerResponse),
      }),
    );
    functionAssociations.push({
      EventType: "viewer-response",
      FunctionARN: viewerResponseOutput.FunctionMetadata.FunctionARN,
    });
  }

  const distributionOutput = await simCloudFront.createDistribution(
    new CreateDistributionCommand({
      DistributionConfig: {
        CallerReference: "cff-host",
        Comment: "CFF host Distribution",
        Enabled: true,
        Aliases: {
          Quantity: 1,
          Items: ["cdn.example.test"],
        },
        Origins: {
          Quantity: 1,
          Items: [
            {
              Id: "host-origin",
              DomainName: "cff-host-bucket.s3.amazonaws.com",
              S3OriginConfig: { OriginAccessIdentity: "" },
            },
          ],
        },
        DefaultCacheBehavior: {
          TargetOriginId: "host-origin",
          ViewerProtocolPolicy: "allow-all",
          FunctionAssociations: {
            Quantity: functionAssociations.length,
            Items: functionAssociations,
          },
        },
      },
    }),
  );

  const distributionId = distributionOutput.Distribution?.Id;
  assertNonNullable(distributionId);

  return distributionId;
}

/**
 * Handle a request through the simulated CloudFront controller.
 */
async function handleCloudFrontRequest(
  simAws: SimAws,
  request: Request,
): Promise<Response> {
  return new SimCloudFrontServiceController({ simAws }).handleRequest(
    new SimAwsServiceRequest({
      target: { service: "cloudFront", resourceName: "" },
      request,
    }),
  );
}

describe("Simulated CloudFront controller CFF host header", () => {
  it("gives a CFF the alternate domain name the request was made to", async () => {
    const simAws = new SimAws();

    // Given a CFF echoing its host back in a response header.
    const distributionId = await makeHostCffDistribution(simAws, {
      viewerRequest: (event: CloudFrontFunction.ViewerRequestEvent) => ({
        statusCode: 204,
        headers: {
          "x-cff-host": {
            value: event.request.headers["host"]?.value ?? "no-host",
          },
        },
      }),
    });

    // When the Distribution is requested by its alternate domain name.
    const aliasResponse = await handleCloudFrontRequest(
      simAws,
      new Request("http://cdn.example.test.sim-aws.localhost/index.html", {
        headers: { host: "cdn.example.test.sim-aws.localhost" },
      }),
    );

    // Then the CFF saw the alternate domain name.
    assertIdentical(
      aliasResponse.headers.get("x-cff-host"),
      "cdn.example.test",
    );

    // And a request by CloudFront domain name sees that instead.
    const distroResponse = await handleCloudFrontRequest(
      simAws,
      new Request(
        `http://${distributionId}.cloudfront.net.sim-aws.localhost/index.html`,
      ),
    );

    assertIdentical(
      distroResponse.headers.get("x-cff-host"),
      `${distributionId.toLowerCase()}.cloudfront.net`,
    );
  });

  it("discards a host a CFF writes, as CloudFront does for a read-only header", async () => {
    const simAws = new SimAws();

    // Given a viewer-request CFF that rewrites the read-only host header.
    const distributionId = await makeHostCffDistribution(simAws, {
      viewerRequest: (event: CloudFrontFunction.ViewerRequestEvent) => {
        event.request.headers["host"] = { value: "somewhere.else.test" };
        return event.request;
      },
      viewerResponse: (event: CloudFrontFunction.ViewerResponseEvent) => {
        event.response.headers["x-cff-host"] = {
          value: event.request.headers["host"]?.value ?? "no-host",
        };
        return event.response;
      },
    });

    const response = await handleCloudFrontRequest(
      simAws,
      new Request(
        `http://${distributionId}.cloudfront.net.sim-aws.localhost/index.html`,
      ),
    );

    // Then the viewer-response CFF still saw the host the viewer requested.
    assertIdentical(
      response.headers.get("x-cff-host"),
      `${distributionId.toLowerCase()}.cloudfront.net`,
    );

    // And the request was still served from the Distribution's Origin.
    assertIdentical(await response.text(), "<h1>From the Origin</h1>");
  });
});
