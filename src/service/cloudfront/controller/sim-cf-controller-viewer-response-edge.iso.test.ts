import {
  assertFalse,
  assertIdentical,
  assertResponseStatus,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import type { DistributionConfig } from "@aws-sdk/client-cloudfront";

import { SimAws } from "../../aws/sim-aws.js";
import type { LambdaAtEdge } from "../typings/lambda-at-edge.namespace.js";
import { makeEdgeFunctionVersionArn } from "../../../../test/cloudfront/edge-function-fixture.js";
import {
  simCfSiteBucket,
  simCfSiteDistributionConfig,
  simCfSiteDistributionId,
  simCfSiteRequest,
} from "../../../../test/cloudfront/site-fixture.js";

/**
 * A Distribution serving one Bucket through a viewer-response edge function.
 */
async function edgeResponseSite(
  simAws: SimAws,
  bucketName: string,
  versionArn: string,
  distributionConfig: Partial<DistributionConfig> = {},
): Promise<string> {
  return await simCfSiteDistributionId(
    simAws,
    simCfSiteDistributionConfig(bucketName, {
      DefaultCacheBehavior: {
        TargetOriginId: "site-origin",
        ViewerProtocolPolicy: "allow-all",
        LambdaFunctionAssociations: {
          Quantity: 1,
          Items: [
            { EventType: "viewer-response", LambdaFunctionARN: versionArn },
          ],
        },
      },
      ...distributionConfig,
    }),
  );
}

/**
 * A viewer-response handler marking the response with the status it saw, so a
 * test can tell whether the function ran at all.
 */
function markerHandler(
  event: LambdaAtEdge.ResponseEvent,
): LambdaAtEdge.Response {
  const { response } = event.Records[0].cf;
  response.headers ??= {};
  response.headers["x-served-status"] = [
    { key: "X-Served-Status", value: response.status },
  ];

  return response;
}

describe("Simulated CloudFront viewer-response Lambda@Edge", () => {
  it("adds a header a viewer-response function set, keeping the Origin body", async () => {
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "edge-response-site", {
      "index.html": "<h1>Home</h1>",
    });

    const versionArn = await makeEdgeFunctionVersionArn({
      simAws,
      functionName: "add-security-header",
      handler: (event: LambdaAtEdge.ResponseEvent) => {
        const { response } = event.Records[0].cf;
        response.headers ??= {};
        response.headers["x-frame-options"] = [
          { key: "X-Frame-Options", value: "DENY" },
        ];

        return response;
      },
    });

    const distributionId = await edgeResponseSite(
      simAws,
      "edge-response-site",
      versionArn,
    );

    const response = await simCfSiteRequest(
      simAws,
      distributionId,
      "/index.html",
    );

    assertResponseStatus(response, 200);
    assertIdentical(response.headers.get("x-frame-options"), "DENY");
    assertIdentical(await response.text(), "<h1>Home</h1>");
  });

  it("gives the handler the request that produced the response", async () => {
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "edge-response-request-site", {
      "index.html": "<h1>Home</h1>",
    });

    const versionArn = await makeEdgeFunctionVersionArn({
      simAws,
      functionName: "echo-request-uri",
      handler: (event: LambdaAtEdge.ResponseEvent) => {
        const { request, response } = event.Records[0].cf;
        response.headers ??= {};
        response.headers["x-served-uri"] = [
          { key: "X-Served-Uri", value: request.uri },
        ];

        return response;
      },
    });

    const distributionId = await edgeResponseSite(
      simAws,
      "edge-response-request-site",
      versionArn,
    );

    const response = await simCfSiteRequest(
      simAws,
      distributionId,
      "/index.html",
    );

    assertIdentical(response.headers.get("x-served-uri"), "/index.html");
  });

  it("replaces the body when the handler wrote one", async () => {
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "edge-response-body-site", {
      "index.html": "<h1>Origin</h1>",
    });

    const versionArn = await makeEdgeFunctionVersionArn({
      simAws,
      functionName: "replace-response-body",
      handler: (event: LambdaAtEdge.ResponseEvent): LambdaAtEdge.Response => ({
        ...event.Records[0].cf.response,
        body: "<h1>Rewritten</h1>",
      }),
    });

    const distributionId = await edgeResponseSite(
      simAws,
      "edge-response-body-site",
      versionArn,
    );

    const response = await simCfSiteRequest(
      simAws,
      distributionId,
      "/index.html",
    );

    assertIdentical(await response.text(), "<h1>Rewritten</h1>");
  });

  it("skips the viewer-response function when the Origin answered with an error", async () => {
    // Given a site with a viewer-response function and no custom error pages.
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "edge-origin-error-site", {
      "index.html": "<h1>Home</h1>",
    });

    const distributionId = await edgeResponseSite(
      simAws,
      "edge-origin-error-site",
      await makeEdgeFunctionVersionArn({
        simAws,
        functionName: "origin-error-marker",
        handler: markerHandler,
      }),
    );

    // When a key the Bucket does not hold is requested, so the Origin
    // answers 404.
    const response = await simCfSiteRequest(simAws, distributionId, "/missing");

    // Then the handler did not run, as CloudFront runs no viewer-response
    // function for an Origin status of 400 or higher.
    assertResponseStatus(response, 404);
    assertFalse(response.headers.has("x-served-status"));
  });

  it("skips the viewer-response function when a custom error page answers 200", async () => {
    // Given a site serving its shell with a 200 for any path the Bucket has
    // no Object for, which is how a single-page app is configured.
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "edge-error-page-site", {
      "404.html": "<h1>Not found</h1>",
    });

    const distributionId = await edgeResponseSite(
      simAws,
      "edge-error-page-site",
      await makeEdgeFunctionVersionArn({
        simAws,
        functionName: "error-page-marker",
        handler: markerHandler,
      }),
      {
        CustomErrorResponses: {
          Quantity: 1,
          Items: [
            {
              ErrorCode: 404,
              ResponsePagePath: "/404.html",
              ResponseCode: "200",
            },
          ],
        },
      },
    );

    // When a page that does not exist is requested.
    const response = await simCfSiteRequest(simAws, distributionId, "/missing");

    // Then the viewer gets the error page as a 200, and the handler still did
    // not run. The status the Origin returned is what decides the skip, not
    // the one the custom error response put in its place.
    assertResponseStatus(response, 200);
    assertIdentical(await response.text(), "<h1>Not found</h1>");
    assertFalse(response.headers.has("x-served-status"));
  });
});
