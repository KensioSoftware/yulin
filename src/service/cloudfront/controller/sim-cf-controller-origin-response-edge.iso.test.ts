import {
  assertIdentical,
  assertResponseStatus,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { LambdaAtEdge } from "../typings/lambda-at-edge.namespace.js";
import { makeEdgeFunctionVersionArn } from "../../../../test/cloudfront/edge-function-fixture.js";
import {
  customOrigin,
  edgeOriginDistributionHostname,
  edgeOriginViewerFetch,
  functionUrlHostname,
  respondingWith,
} from "../../../../test/cloudfront/edge-origin-fixture.js";
import {
  simCfSiteBucket,
  simCfSiteDistributionConfig,
  simCfSiteDistributionId,
  simCfSiteRequest,
} from "../../../../test/cloudfront/site-fixture.js";

describe("Simulated CloudFront origin-response Lambda@Edge", () => {
  it("replaces the body the viewer receives", async () => {
    // Given a site serving a page the function rewrites once the Origin has
    // answered.
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "origin-response-site", {
      "index.html": "<h1>From the Bucket</h1>",
    });

    const versionArn = await makeEdgeFunctionVersionArn({
      simAws,
      functionName: "rewrite-origin-response",
      handler: (
        event: LambdaAtEdge.OriginResponseEvent,
      ): LambdaAtEdge.Response => {
        const { request, response } = event.Records[0].cf;

        return {
          ...response,
          headers: {
            ...response.headers,
            "x-origin-domain": [
              {
                key: "X-Origin-Domain",
                value: request.origin.s3?.domainName ?? "none",
              },
            ],
          },
          body: "<h1>From the edge</h1>",
        };
      },
    });

    const distributionId = await simCfSiteDistributionId(
      simAws,
      simCfSiteDistributionConfig("origin-response-site", {
        DefaultCacheBehavior: {
          TargetOriginId: "site-origin",
          ViewerProtocolPolicy: "allow-all",
          LambdaFunctionAssociations: {
            Quantity: 1,
            Items: [
              { EventType: "origin-response", LambdaFunctionARN: versionArn },
            ],
          },
        },
      }),
    );

    // When a request arrives for the page.
    const response = await simCfSiteRequest(
      simAws,
      distributionId,
      "/index.html",
    );

    // Then the viewer gets the function's body, and the event carried the
    // Origin the response came from.
    assertResponseStatus(response, 200);
    assertIdentical(await response.text(), "<h1>From the edge</h1>");
    assertIdentical(
      response.headers.get("x-origin-domain"),
      "origin-response-site.s3.amazonaws.com",
    );
  });

  it("runs on a 500 from the Origin", async () => {
    // Given an Origin that is failing.
    const simAws = new SimAws();
    const originHost = await functionUrlHostname(
      simAws,
      "failing-origin",
      respondingWith("Origin blew up", 500),
    );

    // And a function turning that into the page the site serves instead.
    const versionArn = await makeEdgeFunctionVersionArn({
      simAws,
      functionName: "repair-origin-error",
      handler: (
        event: LambdaAtEdge.OriginResponseEvent,
      ): LambdaAtEdge.Response => ({
        status: "200",
        statusDescription: "OK",
        headers: {
          "x-origin-status": [
            {
              key: "X-Origin-Status",
              value: event.Records[0].cf.response.status,
            },
          ],
        },
        body: "<h1>Back shortly</h1>",
      }),
    });

    const distroHostname = await edgeOriginDistributionHostname(
      simAws,
      [customOrigin("api", originHost)],
      [{ EventType: "origin-response", LambdaFunctionARN: versionArn }],
    );

    // When a request arrives.
    const response = await edgeOriginViewerFetch(
      simAws,
      distroHostname,
      "/greeting",
    );

    // Then the function ran on the Origin's error and replaced it, which is
    // where the origin events differ from the viewer events.
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), "<h1>Back shortly</h1>");
    assertIdentical(response.headers.get("x-origin-status"), "500");
  });

  it("runs before the custom error page replaces a 404", async () => {
    // Given a site with a custom error page for a 404.
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "custom-error-site", {
      "404.html": "<h1>Not found</h1>",
    });

    // And a function answering the missing page itself.
    const versionArn = await makeEdgeFunctionVersionArn({
      simAws,
      functionName: "answer-missing-page",
      handler: (): LambdaAtEdge.Response => ({
        status: "200",
        statusDescription: "OK",
        body: "<h1>Answered at the Origin</h1>",
      }),
    });

    const distributionId = await simCfSiteDistributionId(
      simAws,
      simCfSiteDistributionConfig("custom-error-site", {
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
        DefaultCacheBehavior: {
          TargetOriginId: "site-origin",
          ViewerProtocolPolicy: "allow-all",
          LambdaFunctionAssociations: {
            Quantity: 1,
            Items: [
              { EventType: "origin-response", LambdaFunctionARN: versionArn },
            ],
          },
        },
      }),
    );

    // When a request arrives for a page the Bucket does not hold.
    const response = await simCfSiteRequest(
      simAws,
      distributionId,
      "/missing.html",
    );

    // Then the function had already turned the 404 into something else by the
    // time the custom error page would have replaced it.
    assertResponseStatus(response, 200);
    assertIdentical(await response.text(), "<h1>Answered at the Origin</h1>");
  });

  it("leaves the viewer-response function skipped when it repaired an Origin error", async () => {
    // Given an Origin that is failing, an origin-response function repairing
    // the status, and a viewer-response function that would add a header.
    const simAws = new SimAws();
    const originHost = await functionUrlHostname(
      simAws,
      "still-failing-origin",
      respondingWith("Origin blew up", 500),
    );

    const originVersionArn = await makeEdgeFunctionVersionArn({
      simAws,
      functionName: "repair-status",
      handler: (): LambdaAtEdge.Response => ({
        status: "200",
        body: "<h1>Back shortly</h1>",
      }),
    });

    const viewerVersionArn = await makeEdgeFunctionVersionArn({
      simAws,
      functionName: "stamp-viewer-response",
      handler: (event: LambdaAtEdge.ResponseEvent): LambdaAtEdge.Response => ({
        ...event.Records[0].cf.response,
        headers: {
          "x-viewer-response": [{ key: "X-Viewer-Response", value: "ran" }],
        },
      }),
    });

    const distroHostname = await edgeOriginDistributionHostname(
      simAws,
      [customOrigin("api", originHost)],
      [
        { EventType: "origin-response", LambdaFunctionARN: originVersionArn },
        { EventType: "viewer-response", LambdaFunctionARN: viewerVersionArn },
      ],
    );

    // When a request arrives.
    const response = await edgeOriginViewerFetch(
      simAws,
      distroHostname,
      "/greeting",
    );

    // Then the status the Origin returned is still what decides the viewer
    // event, so the repaired response reaches the viewer unstamped.
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(response.headers.get("x-viewer-response"), null);
  });
});
