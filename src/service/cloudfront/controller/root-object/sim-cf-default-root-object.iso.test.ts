import { describe, it } from "vitest";
import {
  assertIdentical,
  assertInstanceOf,
  assertResponseStatus,
  assertStringIncludes,
  assertThrowsErrorAsync,
  describeResponse,
} from "@kensio/smartass";
import { CreateDistributionCommand } from "@aws-sdk/client-cloudfront";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimPayload2Event } from "../../../../serve/payload-2/sim-payload-2-event.type.js";
import { simHttpApiLambdaProxyFactory } from "../../../apigatewayv2/api/sim-http-api-lambda-proxy.factory.js";
import { SimCloudFrontInvalidDefaultRootObject } from "../../error/sim-cloudfront.error.js";
import {
  simCfSiteBucket,
  simCfSiteDistributionConfig,
  simCfSiteDistributionId,
  simCfSiteRequest,
} from "../../../../../test/cloudfront/site-fixture.js";

describe("Sim CloudFront default root object", () => {
  it("serves the default root object for a request to the Distribution root", async () => {
    // Given a site with a home page and a Distribution naming it as the
    // default root object.
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "root-object-site", {
      "index.html": "<h1>Home</h1>",
    });
    const distributionId = await simCfSiteDistributionId(
      simAws,
      simCfSiteDistributionConfig("root-object-site", {
        DefaultRootObject: "index.html",
      }),
    );

    // When the root of the Distribution is requested.
    const response = await simCfSiteRequest(simAws, distributionId, "/");

    // Then the home page is served.
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), "<h1>Home</h1>");
  });

  it("serves an object in a folder as the default root object", async () => {
    // Given a default root object naming a path rather than a bare object,
    // which CloudFront also allows.
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "folder-root-object-site", {
      "public/index.html": "<h1>Public home</h1>",
    });
    const distributionId = await simCfSiteDistributionId(
      simAws,
      simCfSiteDistributionConfig("folder-root-object-site", {
        DefaultRootObject: "public/index.html",
      }),
    );

    // When the root of the Distribution is requested.
    const response = await simCfSiteRequest(simAws, distributionId, "/");

    // Then the object at that path is served.
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), "<h1>Public home</h1>");
  });

  it("does not apply the default root object to a subdirectory", async () => {
    // Given a subdirectory holding its own copy of the default root object,
    // which CloudFront does not substitute, unlike an S3 website index
    // document.
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "subdirectory-site", {
      "index.html": "<h1>Home</h1>",
      "blog/index.html": "<h1>Blog</h1>",
    });
    const distributionId = await simCfSiteDistributionId(
      simAws,
      simCfSiteDistributionConfig("subdirectory-site", {
        DefaultRootObject: "index.html",
      }),
    );

    // When the subdirectory is requested.
    const response = await simCfSiteRequest(simAws, distributionId, "/blog/");

    // Then the request reaches the Origin as it arrived and finds nothing.
    assertResponseStatus(response, 404, await describeResponse(response));
  });

  it("keeps the request path when no default root object is configured", async () => {
    // Given a Distribution with no default root object.
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "no-root-object-site", {
      "index.html": "<h1>Home</h1>",
    });
    const distributionId = await simCfSiteDistributionId(
      simAws,
      simCfSiteDistributionConfig("no-root-object-site"),
    );

    // When the root of the Distribution is requested.
    const response = await simCfSiteRequest(simAws, distributionId, "/");

    // Then the Origin is asked for the root itself, which holds no object.
    assertResponseStatus(response, 404, await describeResponse(response));
  });

  it("serves the default root object over a custom Origin", async () => {
    // Given an HTTP API serving the path the default root object names.
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      {
        handler: (event: SimPayload2Event): unknown => ({
          rawPath: event.rawPath,
        }),
        routeKeys: ["GET /index.html"],
      },
      simAws,
    );

    // And a Distribution with that API as a custom Origin.
    const distributionId = await simCfSiteDistributionId(simAws, {
      CallerReference: "custom-origin-root-object",
      Comment: "Custom Origin root object",
      Enabled: true,
      DefaultRootObject: "index.html",
      Origins: {
        Quantity: 1,
        Items: [
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
        TargetOriginId: "api-origin",
        ViewerProtocolPolicy: "allow-all",
      },
    });

    // When the root of the Distribution is requested.
    const response = await simCfSiteRequest(simAws, distributionId, "/");

    // Then the Origin saw the default root object rather than the root, so
    // the substitution is not specific to an S3 Origin.
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), '{"rawPath":"/index.html"}');
  });

  it("applies the default root object to a POST to the root", async () => {
    // Given an API taking a POST at the path the default root object names.
    // CloudFront substitutes the default root object for every method the
    // Distribution allows, not only for a GET.
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      {
        handler: (event: SimPayload2Event): unknown => ({
          rawPath: event.rawPath,
          body: event.body,
        }),
        routeKeys: ["POST /index.html"],
      },
      simAws,
    );

    const distributionId = await simCfSiteDistributionId(simAws, {
      CallerReference: "post-root-object",
      Comment: "POST root object",
      Enabled: true,
      DefaultRootObject: "index.html",
      Origins: {
        Quantity: 1,
        Items: [
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
        TargetOriginId: "api-origin",
        ViewerProtocolPolicy: "allow-all",
        AllowedMethods: {
          Quantity: 3,
          Items: ["GET", "HEAD", "POST"],
          CachedMethods: { Quantity: 2, Items: ["GET", "HEAD"] },
        },
      },
    });

    // When the root of the Distribution is posted to.
    const response = await simCfSiteRequest(simAws, distributionId, "/", {
      method: "POST",
      body: "order=17",
    });

    // Then the Origin saw the substituted path, with the body still on it.
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(
      await response.text(),
      '{"rawPath":"/index.html","body":"order=17"}',
    );
  });

  it("refuses a default root object beginning with a forward slash", async () => {
    // Given a default root object written as a path from the root, which real
    // CloudFront answers with a 403 on every request to the Distribution root.
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "slash-root-object-site", {
      "index.html": "<h1>Home</h1>",
    });

    // When the Distribution is created.
    const creation = assertThrowsErrorAsync(
      async () =>
        await simAws.cloudFront().createDistribution(
          new CreateDistributionCommand({
            DistributionConfig: simCfSiteDistributionConfig(
              "slash-root-object-site",
              { DefaultRootObject: "/index.html" },
            ),
          }),
        ),
    );

    // Then it is refused as InvalidDefaultRootObject, as an unusable value.
    const error = await creation;
    assertInstanceOf(error, SimCloudFrontInvalidDefaultRootObject);
    assertStringIncludes(error.message, "/index.html");
  });

  it("treats an empty default root object as none", async () => {
    // Given an empty DefaultRootObject, which is how CloudFront expresses
    // having none.
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "empty-root-object-site", {
      "index.html": "<h1>Home</h1>",
    });
    const distributionId = await simCfSiteDistributionId(
      simAws,
      simCfSiteDistributionConfig("empty-root-object-site", {
        DefaultRootObject: "",
      }),
    );

    // When the root of the Distribution is requested.
    const response = await simCfSiteRequest(simAws, distributionId, "/");

    // Then nothing is substituted.
    assertResponseStatus(response, 404, await describeResponse(response));
  });
});
