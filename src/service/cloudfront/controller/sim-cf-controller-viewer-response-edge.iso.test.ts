import { assertIdentical, assertResponseStatus } from "@kensio/smartass";
import { describe, it } from "vitest";

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
    }),
  );
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
});
