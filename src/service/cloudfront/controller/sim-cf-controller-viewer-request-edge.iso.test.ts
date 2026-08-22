import {
  assertIdentical,
  assertNonNullable,
  assertResponseStatus,
  assertStringIncludes,
} from "@kensio/smartass";
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

describe("Simulated CloudFront viewer-request Lambda@Edge", () => {
  it("serves the path a viewer-request function rewrote the URI to", async () => {
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "edge-rewrite-site", {
      "index.html": "<h1>Home</h1>",
    });

    const versionArn = await makeEdgeFunctionVersionArn({
      simAws,
      functionName: "rewrite-uri",
      handler: (event: LambdaAtEdge.RequestEvent) => {
        const { request } = event.Records[0].cf;
        request.uri = "/index.html";

        return request;
      },
    });

    const distributionId = await simCfSiteDistributionId(
      simAws,
      simCfSiteDistributionConfig("edge-rewrite-site", {
        DefaultCacheBehavior: {
          TargetOriginId: "site-origin",
          ViewerProtocolPolicy: "allow-all",
          LambdaFunctionAssociations: {
            Quantity: 1,
            Items: [
              { EventType: "viewer-request", LambdaFunctionARN: versionArn },
            ],
          },
        },
      }),
    );

    const response = await simCfSiteRequest(simAws, distributionId, "/");

    assertResponseStatus(response, 200);
    assertIdentical(await response.text(), "<h1>Home</h1>");
  });

  it("gives the handler request headers as lists keyed by lowercase name", async () => {
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "edge-headers-site", {});

    const versionArn = await makeEdgeFunctionVersionArn({
      simAws,
      functionName: "echo-headers",
      handler: (event: LambdaAtEdge.RequestEvent): LambdaAtEdge.Response => ({
        status: "200",
        headers: {
          "content-type": [{ key: "Content-Type", value: "application/json" }],
        },
        body: JSON.stringify(event.Records[0].cf.request.headers),
      }),
    });

    const distributionId = await simCfSiteDistributionId(
      simAws,
      simCfSiteDistributionConfig("edge-headers-site", {
        DefaultCacheBehavior: {
          TargetOriginId: "site-origin",
          ViewerProtocolPolicy: "allow-all",
          LambdaFunctionAssociations: {
            Quantity: 1,
            Items: [
              { EventType: "viewer-request", LambdaFunctionARN: versionArn },
            ],
          },
        },
      }),
    );

    const response = await simCfSiteRequest(simAws, distributionId, "/any", {
      headers: { "x-order-id": "1042" },
    });

    const headers = (await response.json()) as LambdaAtEdge.Headers;
    const orderId = headers["x-order-id"]?.[0];
    const host = headers["host"]?.[0];

    assertNonNullable(orderId, "the handler saw the x-order-id header");
    assertNonNullable(host, "the handler saw the host header");
    assertIdentical(orderId.value, "1042");
    assertIdentical(orderId.key, "X-Order-Id");
    assertStringIncludes(host.value, ".cloudfront.net");
  });

  it("answers the viewer from a function that returned a response, without reading the Origin", async () => {
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "edge-redirect-site", {
      "index.html": "<h1>Never served</h1>",
    });

    const versionArn = await makeEdgeFunctionVersionArn({
      simAws,
      functionName: "redirect-viewer",
      handler: (): LambdaAtEdge.Response => ({
        status: "302",
        statusDescription: "Found",
        headers: {
          location: [{ key: "Location", value: "https://example.com/moved" }],
        },
      }),
    });

    const distributionId = await simCfSiteDistributionId(
      simAws,
      simCfSiteDistributionConfig("edge-redirect-site", {
        DefaultCacheBehavior: {
          TargetOriginId: "site-origin",
          ViewerProtocolPolicy: "allow-all",
          LambdaFunctionAssociations: {
            Quantity: 1,
            Items: [
              { EventType: "viewer-request", LambdaFunctionARN: versionArn },
            ],
          },
        },
      }),
    );

    const response = await simCfSiteRequest(simAws, distributionId, "/");

    assertResponseStatus(response, 302);
    assertIdentical(
      response.headers.get("location"),
      "https://example.com/moved",
    );
    assertIdentical(await response.text(), "");
  });

  it("answers the viewer with a 502 when the handler throws", async () => {
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "edge-throwing-site", {
      "index.html": "<h1>Never served</h1>",
    });

    const versionArn = await makeEdgeFunctionVersionArn({
      simAws,
      functionName: "throwing-edge",
      handler: () => {
        throw new Error("Boom");
      },
    });

    const distributionId = await simCfSiteDistributionId(
      simAws,
      simCfSiteDistributionConfig("edge-throwing-site", {
        DefaultCacheBehavior: {
          TargetOriginId: "site-origin",
          ViewerProtocolPolicy: "allow-all",
          LambdaFunctionAssociations: {
            Quantity: 1,
            Items: [
              { EventType: "viewer-request", LambdaFunctionARN: versionArn },
            ],
          },
        },
      }),
    );

    const response = await simCfSiteRequest(simAws, distributionId, "/");

    assertResponseStatus(response, 502);
  });

  it("gives the handler the request body when the association includes it", async () => {
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "edge-body-site", {});

    const versionArn = await makeEdgeFunctionVersionArn({
      simAws,
      functionName: "echo-body",
      handler: (event: LambdaAtEdge.RequestEvent): LambdaAtEdge.Response => ({
        status: "200",
        body: Buffer.from(
          event.Records[0].cf.request.body?.data ?? "",
          "base64",
        ).toString(),
      }),
    });

    const distributionId = await simCfSiteDistributionId(
      simAws,
      simCfSiteDistributionConfig("edge-body-site", {
        DefaultCacheBehavior: {
          TargetOriginId: "site-origin",
          ViewerProtocolPolicy: "allow-all",
          AllowedMethods: { Quantity: 3, Items: ["GET", "HEAD", "POST"] },
          LambdaFunctionAssociations: {
            Quantity: 1,
            Items: [
              {
                EventType: "viewer-request",
                LambdaFunctionARN: versionArn,
                IncludeBody: true,
              },
            ],
          },
        },
      }),
    );

    const response = await simCfSiteRequest(simAws, distributionId, "/orders", {
      method: "POST",
      body: "order=1042",
    });

    assertIdentical(await response.text(), "order=1042");
  });
});
