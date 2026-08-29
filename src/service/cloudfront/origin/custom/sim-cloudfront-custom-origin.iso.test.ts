import {
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
} from "@aws-sdk/client-lambda";
import {
  CreateDistributionCommand,
  type Origin,
} from "@aws-sdk/client-cloudfront";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertNonNullable,
  assertResponseStatus,
  assertStringIncludes,
  assertThrowsErrorAsync,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../../serve/http/url/sim-aws-local-url.js";
import type { SimPayload2Event } from "../../../../serve/payload-2/sim-payload-2-event.type.js";
import { simHttpApiLambdaProxyFactory } from "../../../apigatewayv2/api/sim-http-api-lambda-proxy.factory.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { grantPublicObjectRead } from "../../../s3/bucket/sim-s3-public-read.fixture.js";
import { makeLambdaZipFileInput } from "../../../lambda/function/code/lambda-zip-file-input.js";
import { simCfManagedOriginRequestPolicyIds } from "../../origin-request-policy/sim-cf-managed-origin-request-policies.js";
import { SimCloudFront } from "../../sim-cloudfront.js";

/**
 * Create a Distribution sending everything to one custom Origin, and return
 * the hostname a viewer reaches it on.
 *
 * A Behavior naming no origin request policy carries none of the viewer's
 * query strings to the Origin, so a test about what the Origin reads names one.
 */
async function distributionForOrigin(
  simAws: SimAws,
  origin: Origin,
  originRequestPolicyId?: string,
): Promise<string> {
  const creation = await simAws.cloudFront().createDistribution(
    new CreateDistributionCommand({
      DistributionConfig: {
        CallerReference: "custom-origin",
        Comment: "Custom Origin CDN",
        Enabled: true,
        Origins: { Quantity: 1, Items: [origin] },
        DefaultCacheBehavior: {
          TargetOriginId: origin.Id,
          ViewerProtocolPolicy: "allow-all",
          AllowedMethods: {
            Quantity: 3,
            Items: ["GET", "HEAD", "POST"],
            CachedMethods: { Quantity: 2, Items: ["GET", "HEAD"] },
          },
          ...(originRequestPolicyId !== undefined && {
            OriginRequestPolicyId: originRequestPolicyId,
          }),
        },
      },
    }),
  );

  const distroHostname = creation.Distribution?.DomainName;
  assertNonNullable(distroHostname);

  return distroHostname;
}

function viewerUrl(distroHostname: string, path: string): string {
  return new SimAwsLocalUrl({
    input: `https://${distroHostname}${path}`,
  }).toString();
}

describe("Simulated CloudFront custom Origin", () => {
  it("serves a simulated HTTP API through the Distribution", async () => {
    // Given an HTTP API serving a route.
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      {
        handler: (): unknown => ({ things: ["kettle"] }),
        routeKeys: ["GET /things"],
      },
      simAws,
    );

    // And a Distribution with the API's endpoint as a custom Origin.
    const distroHostname = await distributionForOrigin(simAws, {
      Id: "api-origin",
      DomainName: new URL(api.apiEndpoint).hostname,
      CustomOriginConfig: {
        HTTPPort: 80,
        HTTPSPort: 443,
        OriginProtocolPolicy: "https-only",
      },
    });

    // When the route is requested through the Distribution.
    const response = await new SimAwsHttp({ simAws }).fetch(
      viewerUrl(distroHostname, "/things"),
    );

    // Then the API's response is what the viewer sees.
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), '{"things":["kettle"]}');
  });

  it("serves a simulated Lambda Function URL through the Distribution", async () => {
    // Given a function served at a public Function URL.
    const simAws = new SimAws();
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: "arn:aws:iam::111111111111:role/GreeterRole",
        Code: {
          ZipFile: makeLambdaZipFileInput(() => ({
            statusCode: 200,
            headers: { "content-type": "text/plain" },
            body: "Hello from behind CloudFront",
          })),
        },
      }),
    );
    const { FunctionUrl: functionUrl } = await simAws
      .lambda()
      .createFunctionUrlConfig(
        new CreateFunctionUrlConfigCommand({
          FunctionName: "greeter",
          AuthType: "NONE",
        }),
      );
    assertNonNullable(functionUrl);

    // And a Distribution with the Function URL as a custom Origin.
    const distroHostname = await distributionForOrigin(simAws, {
      Id: "function-origin",
      DomainName: new URL(functionUrl).hostname,
      CustomOriginConfig: {
        HTTPPort: 80,
        HTTPSPort: 443,
        OriginProtocolPolicy: "https-only",
      },
    });

    // When the Distribution is requested.
    const response = await new SimAwsHttp({ simAws }).fetch(
      viewerUrl(distroHostname, "/greeting"),
    );

    // Then the function's response is what the viewer sees.
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), "Hello from behind CloudFront");
  });

  it("prepends the Origin path to the request path", async () => {
    // Given an API whose routes all sit under a prefix.
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      {
        handler: (event: SimPayload2Event): unknown => ({
          rawPath: event.rawPath,
          query: event.rawQueryString,
        }),
        routeKeys: ["GET /v1/things"],
      },
      simAws,
    );

    // And a Distribution whose Origin adds that prefix, on a Behavior
    // forwarding what the viewer sent.
    const distroHostname = await distributionForOrigin(
      simAws,
      {
        Id: "api-origin",
        DomainName: new URL(api.apiEndpoint).hostname,
        OriginPath: "/v1",
        CustomOriginConfig: {
          HTTPPort: 80,
          HTTPSPort: 443,
          OriginProtocolPolicy: "https-only",
        },
      },
      simCfManagedOriginRequestPolicyIds.allViewer,
    );

    // When a request is made without the prefix.
    const response = await new SimAwsHttp({ simAws }).fetch(
      viewerUrl(distroHostname, "/things?colour=copper"),
    );

    // Then the Origin saw the prefixed path, and the query string with it.
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(
      await response.text(),
      '{"rawPath":"/v1/things","query":"colour=copper"}',
    );
  });

  it("passes the request method and body on to the Origin", async () => {
    // Given an API echoing what it was sent.
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      {
        handler: (event: SimPayload2Event): unknown => ({
          method: event.requestContext.http.method,
          body: event.body,
        }),
        routeKeys: ["POST /things"],
      },
      simAws,
    );
    const distroHostname = await distributionForOrigin(simAws, {
      Id: "api-origin",
      DomainName: new URL(api.apiEndpoint).hostname,
      CustomOriginConfig: {
        HTTPPort: 80,
        HTTPSPort: 443,
        OriginProtocolPolicy: "https-only",
      },
    });

    // When a POST with a body goes through the Distribution.
    const response = await new SimAwsHttp({ simAws }).fetch(
      viewerUrl(distroHostname, "/things"),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"name":"kettle"}',
      },
    );

    // Then the Origin was sent both.
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(
      await response.text(),
      String.raw`{"method":"POST","body":"{\"name\":\"kettle\"}"}`,
    );
  });

  it("sends one path pattern to the API and the rest to the Bucket", async () => {
    // Given an API and a Bucket holding a page.
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      {
        handler: (): unknown => ({ things: ["kettle"] }),
        routeKeys: ["GET /api/things"],
      },
      simAws,
    );
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "site-bucket" }));
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "site-bucket",
        Key: "index.html",
        Body: "<h1>Site</h1>",
      }),
    );
    await grantPublicObjectRead(simAws.s3(), "site-bucket");

    // And a Distribution serving the site, with /api/* going to the API.
    const creation = await simAws.cloudFront().createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: {
          CallerReference: "site-and-api",
          Comment: "Site and API CDN",
          Enabled: true,
          Origins: {
            Quantity: 2,
            Items: [
              {
                Id: "site-origin",
                DomainName: "site-bucket.s3.amazonaws.com",
                S3OriginConfig: { OriginAccessIdentity: "" },
              },
              {
                Id: "api-origin",
                DomainName: new URL(api.apiEndpoint).hostname,
                CustomOriginConfig: {
                  HTTPPort: 80,
                  HTTPSPort: 443,
                  OriginProtocolPolicy: "https-only",
                },
              },
            ],
          },
          DefaultCacheBehavior: {
            TargetOriginId: "site-origin",
            ViewerProtocolPolicy: "allow-all",
          },
          CacheBehaviors: {
            Quantity: 1,
            Items: [
              {
                PathPattern: "/api/*",
                TargetOriginId: "api-origin",
                ViewerProtocolPolicy: "allow-all",
              },
            ],
          },
        },
      }),
    );
    const distroHostname = creation.Distribution?.DomainName;
    assertNonNullable(distroHostname);

    // When both a page and an API route are requested.
    const http = new SimAwsHttp({ simAws });
    const pageResponse = await http.fetch(
      viewerUrl(distroHostname, "/index.html"),
    );
    const apiResponse = await http.fetch(
      viewerUrl(distroHostname, "/api/things"),
    );

    // Then each Behavior served from its own Origin.
    assertResponseStatus(
      pageResponse,
      200,
      await describeResponse(pageResponse),
    );
    assertIdentical(await pageResponse.text(), "<h1>Site</h1>");
    assertResponseStatus(apiResponse, 200, await describeResponse(apiResponse));
    assertIdentical(await apiResponse.text(), '{"things":["kettle"]}');
  });

  it("fails an Origin domain naming nothing in the simulation", async () => {
    // Given a Distribution with a custom Origin outside the simulation.
    const simAws = new SimAws();
    const distroHostname = await distributionForOrigin(simAws, {
      Id: "api-origin",
      DomainName: "api.example.test",
      CustomOriginConfig: {
        HTTPPort: 80,
        HTTPSPort: 443,
        OriginProtocolPolicy: "https-only",
      },
    });

    // When it is requested.
    const response = await new SimAwsHttp({ simAws }).fetch(
      viewerUrl(distroHostname, "/things"),
    );

    // Then the failure names the Origin and its domain, rather than the
    // request being sent to the real domain.
    assertResponseStatus(response, 500, await describeResponse(response));
    assertStringIncludes(
      await response.text(),
      "Sim CloudFront Origin api-origin domain name api.example.test does not resolve to a simulated AWS service",
    );
  });

  it("refuses a custom Origin on a standalone sim CloudFront", async () => {
    // Given a sim CloudFront with no simulated environment around it.
    const simCloudFront = new SimCloudFront();

    // When a Distribution declares a custom Origin.
    const error = await assertThrowsErrorAsync(async () =>
      simCloudFront.createDistribution(
        new CreateDistributionCommand({
          DistributionConfig: {
            CallerReference: "standalone",
            Comment: "Standalone CDN",
            Enabled: true,
            Origins: {
              Quantity: 1,
              Items: [
                {
                  Id: "api-origin",
                  DomainName: "abc123.execute-api.eu-west-2.amazonaws.com",
                  CustomOriginConfig: {
                    HTTPPort: 80,
                    HTTPSPort: 443,
                    OriginProtocolPolicy: "https-only",
                  },
                },
              ],
            },
            DefaultCacheBehavior: {
              TargetOriginId: "api-origin",
              ViewerProtocolPolicy: "allow-all",
            },
          },
        }),
      ),
    );

    // Then it is refused, because there is nothing for it to reach.
    assertStringIncludes(
      error.message,
      "Simulated AWS environment for sim CloudFront custom Origin api-origin",
    );
  });
});
