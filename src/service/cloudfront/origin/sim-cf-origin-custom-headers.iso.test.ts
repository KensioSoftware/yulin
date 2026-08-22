import { CreateDistributionCommand } from "@aws-sdk/client-cloudfront";
import {
  CreateBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  PutPublicAccessBlockCommand,
} from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import type { SimPayload2Event } from "../../../serve/payload-2/sim-payload-2-event.type.js";
import { simHttpApiLambdaProxyFactory } from "../../apigatewayv2/api/sim-http-api-lambda-proxy.factory.js";
import { SimAws } from "../../aws/sim-aws.js";
import {
  SimCloudFrontInconsistentQuantities,
  SimCloudFrontInvalidArgument,
} from "../error/sim-cloudfront.error.js";

/**
 * An HTTP API answering with the headers its request arrived with, which is
 * what an origin checking for a custom header reads.
 */
async function apiEchoingHeaders(simAws: SimAws): Promise<string> {
  const api = await simHttpApiLambdaProxyFactory.make(
    {
      routeKeys: ["GET /headers"],
      handler: (event: SimPayload2Event): unknown => event.headers,
    },
    simAws,
  );

  return new URL(api.apiEndpoint).hostname;
}

/**
 * Create a Distribution fronting `originDomain` with the Origin properties
 * given, and answer its hostname.
 */
async function distributionFronting(
  simAws: SimAws,
  originDomain: string,
  originProperties: object,
): Promise<string> {
  const creation = await simAws.cloudFront().createDistribution(
    new CreateDistributionCommand({
      DistributionConfig: {
        CallerReference: "custom-header-distribution",
        Comment: "Custom header Distribution",
        Enabled: true,
        Origins: {
          Quantity: 1,
          Items: [
            {
              Id: "api",
              DomainName: originDomain,
              CustomOriginConfig: {
                HTTPPort: 80,
                HTTPSPort: 443,
                OriginProtocolPolicy: "https-only",
              },
              ...originProperties,
            },
          ],
        },
        DefaultCacheBehavior: {
          TargetOriginId: "api",
          ViewerProtocolPolicy: "redirect-to-https",
        },
      },
    }),
  );

  return `${creation.Distribution?.Id?.toLowerCase() ?? ""}.cloudfront.net`;
}

/**
 * Send a request through a Distribution and read the headers the Origin saw.
 */
async function headersAtOrigin(
  simAws: SimAws,
  distributionHostname: string,
  viewerHeaders: Record<string, string> = {},
): Promise<Record<string, string>> {
  const response = await new SimAwsHttp({ simAws }).fetch(
    new SimAwsLocalUrl({
      input: `https://${distributionHostname}/headers`,
    }).toString(),
    { headers: viewerHeaders },
  );

  return (await response.json()) as Record<string, string>;
}

describe("sim CloudFront Origin custom headers", () => {
  it("adds the headers an Origin was created with to the Origin request", async () => {
    // Given an Origin carrying a secret its origin checks for
    const simAws = new SimAws();
    const originDomain = await apiEchoingHeaders(simAws);

    // When a request is served through the Distribution
    const distributionHostname = await distributionFronting(
      simAws,
      originDomain,
      {
        CustomHeaders: {
          Quantity: 2,
          Items: [
            { HeaderName: "X-Origin-Secret", HeaderValue: "shibboleth" },
            { HeaderName: "X-From-Cdn", HeaderValue: "yes" },
          ],
        },
      },
    );
    const headers = await headersAtOrigin(simAws, distributionHostname);

    // Then the Origin sees both of them
    assertIdentical(headers["x-origin-secret"], "shibboleth");
    assertIdentical(headers["x-from-cdn"], "yes");
  });

  it("adds the headers a template writes as OriginCustomHeaders", async () => {
    // Given the CloudFormation spelling of the property, as a plain array
    const simAws = new SimAws();
    const originDomain = await apiEchoingHeaders(simAws);

    // When a request is served through the Distribution
    const distributionHostname = await distributionFronting(
      simAws,
      originDomain,
      {
        OriginCustomHeaders: [
          { HeaderName: "X-Origin-Secret", HeaderValue: "shibboleth" },
        ],
      },
    );
    const headers = await headersAtOrigin(simAws, distributionHostname);

    // Then the Origin sees the header, as it does for the API spelling
    assertIdentical(headers["x-origin-secret"], "shibboleth");
  });

  it("replaces a viewer's own copy of a configured header", async () => {
    // Given a viewer sending the header the Origin trusts, in another case
    const simAws = new SimAws();
    const originDomain = await apiEchoingHeaders(simAws);

    // When the request is served through the Distribution
    const distributionHostname = await distributionFronting(
      simAws,
      originDomain,
      {
        CustomHeaders: {
          Quantity: 1,
          Items: [{ HeaderName: "X-Origin-Secret", HeaderValue: "shibboleth" }],
        },
      },
    );
    const headers = await headersAtOrigin(simAws, distributionHostname, {
      "X-ORIGIN-SECRET": "guessed",
    });

    // Then the Origin's value replaces the viewer's, which is what stops a
    // viewer spoofing the header through the Distribution
    assertIdentical(headers["x-origin-secret"], "shibboleth");
  });

  it("sends nothing extra to an Origin with no custom headers", async () => {
    // Given an Origin configured without any
    const simAws = new SimAws();
    const originDomain = await apiEchoingHeaders(simAws);

    // When a request is served through the Distribution
    const distributionHostname = await distributionFronting(
      simAws,
      originDomain,
      {},
    );
    const headers = await headersAtOrigin(simAws, distributionHostname);

    // Then the Origin sees no secret
    assertUndefined(headers["x-origin-secret"]);
  });

  it("refuses a header name CloudFront will not add", async () => {
    // Given an Origin asking for a header on CloudFront's denylist
    const simAws = new SimAws();
    const originDomain = await apiEchoingHeaders(simAws);

    // When the Distribution is created
    const error = await assertThrowsErrorAsync(async () =>
      distributionFronting(simAws, originDomain, {
        CustomHeaders: {
          Quantity: 1,
          Items: [
            { HeaderName: "Host", HeaderValue: "elsewhere.example.test" },
          ],
        },
      }),
    );

    // Then it is refused, naming the header
    assertInstanceOf(error, SimCloudFrontInvalidArgument);
    assertIdentical(
      error.message,
      "Sim CloudFront Origin api custom header Host is one CloudFront " +
        "refuses to add to an Origin request. See https://docs.aws.amazon.com/" +
        "AmazonCloudFront/latest/DeveloperGuide/add-origin-custom-headers.html",
    );
  });

  it("refuses a header name on a denied prefix", async () => {
    // Given an Origin asking for a header CloudFront reserves by prefix
    const simAws = new SimAws();
    const originDomain = await apiEchoingHeaders(simAws);

    // When the Distribution is created
    const error = await assertThrowsErrorAsync(async () =>
      distributionFronting(simAws, originDomain, {
        OriginCustomHeaders: [
          { HeaderName: "X-Amz-Content-Sha256", HeaderValue: "0" },
        ],
      }),
    );

    // Then it is refused, as one named on the denylist is
    assertInstanceOf(error, SimCloudFrontInvalidArgument);
  });

  it("refuses a custom header with no name", async () => {
    // Given a header written with a value and no name
    const simAws = new SimAws();
    const originDomain = await apiEchoingHeaders(simAws);

    // When the Distribution is created
    const error = await assertThrowsErrorAsync(async () =>
      distributionFronting(simAws, originDomain, {
        OriginCustomHeaders: [{ HeaderValue: "shibboleth" }],
      }),
    );

    // Then it is refused, naming the Origin
    assertInstanceOf(error, SimCloudFrontInvalidArgument);
    assertIdentical(
      error.message,
      "Sim CloudFront Origin api has a custom header with no HeaderName",
    );
  });

  it("refuses a custom header list whose Quantity disagrees with its Items", async () => {
    // Given a count that does not match the headers written under it
    const simAws = new SimAws();
    const originDomain = await apiEchoingHeaders(simAws);

    // When the Distribution is created
    const error = await assertThrowsErrorAsync(async () =>
      distributionFronting(simAws, originDomain, {
        CustomHeaders: {
          Quantity: 2,
          Items: [{ HeaderName: "X-Origin-Secret", HeaderValue: "shibboleth" }],
        },
      }),
    );

    // Then it is refused, as any CloudFront list with a wrong count is
    assertInstanceOf(error, SimCloudFrontInconsistentQuantities);
    assertIdentical(
      error.message,
      "CloudFront CustomHeaders has Quantity 2 and 1 Items",
    );
  });

  it("takes a header on an S3 Origin and serves the Bucket without it", async () => {
    // Given an S3 Origin carrying a custom header. It reads its Bucket through
    // GetObject and builds no request for a header to travel on.
    const simAws = new SimAws();
    const simS3 = simAws.s3();
    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "assets.example.test" }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "assets.example.test",
        Key: "index.html",
        Body: "<h1>Kettle</h1>",
      }),
    );
    await simS3.putPublicAccessBlock(
      new PutPublicAccessBlockCommand({
        Bucket: "assets.example.test",
        PublicAccessBlockConfiguration: { BlockPublicPolicy: false },
      }),
    );
    await simS3.putBucketPolicy(
      new PutBucketPolicyCommand({
        Bucket: "assets.example.test",
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: "*",
            Action: "s3:GetObject",
            Resource: "arn:aws:s3:::assets.example.test/*",
          },
        }),
      }),
    );

    // When a request is served through the Distribution
    const creation = await simAws.cloudFront().createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: {
          CallerReference: "s3-custom-header-distribution",
          Comment: "S3 custom header Distribution",
          Enabled: true,
          Origins: {
            Quantity: 1,
            Items: [
              {
                Id: "assets",
                DomainName: "assets.example.test.s3.amazonaws.com",
                S3OriginConfig: { OriginAccessIdentity: "" },
                CustomHeaders: {
                  Quantity: 1,
                  Items: [
                    {
                      HeaderName: "X-Origin-Secret",
                      HeaderValue: "shibboleth",
                    },
                  ],
                },
              },
            ],
          },
          DefaultCacheBehavior: {
            TargetOriginId: "assets",
            ViewerProtocolPolicy: "redirect-to-https",
          },
        },
      }),
    );
    const distributionHostname = `${creation.Distribution?.Id?.toLowerCase() ?? ""}.cloudfront.net`;
    const response = await new SimAwsHttp({ simAws }).fetch(
      new SimAwsLocalUrl({
        input: `https://${distributionHostname}/index.html`,
      }).toString(),
    );

    // Then the Object is served, and the header reached nothing
    assertIdentical(await response.text(), "<h1>Kettle</h1>");
  });
});
