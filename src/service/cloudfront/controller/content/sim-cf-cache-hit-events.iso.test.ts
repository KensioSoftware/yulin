import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { simCfManagedResponseHeadersPolicyIds } from "../../response-headers-policy/sim-cf-managed-response-headers-policies.js";
import type { LambdaAtEdge } from "../../typings/lambda-at-edge.namespace.js";
import { makeEdgeFunctionVersionArn } from "../../../../../test/cloudfront/edge-function-fixture.js";
import {
  countingOrigin,
  distributionServing,
  type OriginReads,
} from "../../../../../test/cloudfront/cache-fixture.js";
import { simCfSiteRequest } from "../../../../../test/cloudfront/site-fixture.js";

/**
 * How many times an edge function has run, which is what says whether the
 * event fired for a request the cache answered.
 */
interface EventRuns {
  count: number;
}

describe("Which sim CloudFront events a cache hit runs", () => {
  it("runs neither origin event on a hit", async () => {
    // Given a Behavior counting both of its origin events, in front of an
    // Origin counting its reads.
    const simAws = new SimAws();
    const reads: OriginReads = { count: 0 };
    const requestRuns: EventRuns = { count: 0 };
    const responseRuns: EventRuns = { count: 0 };

    const distributionId = await distributionServing(
      simAws,
      await countingOrigin(simAws, reads),
      {
        TargetOriginId: "api",
        LambdaFunctionAssociations: {
          Quantity: 2,
          Items: [
            {
              EventType: "origin-request",
              LambdaFunctionARN: await makeEdgeFunctionVersionArn({
                simAws,
                functionName: "counting-origin-request",
                handler: (event: LambdaAtEdge.OriginRequestEvent) => {
                  requestRuns.count += 1;

                  return event.Records[0].cf.request;
                },
              }),
            },
            {
              EventType: "origin-response",
              LambdaFunctionARN: await makeEdgeFunctionVersionArn({
                simAws,
                functionName: "counting-origin-response",
                handler: (event: LambdaAtEdge.ResponseEvent) => {
                  responseRuns.count += 1;

                  return event.Records[0].cf.response;
                },
              }),
            },
          ],
        },
      },
    );

    // When the same path is asked for twice.
    await simCfSiteRequest(simAws, distributionId, "/greeting");
    const hit = await simCfSiteRequest(simAws, distributionId, "/greeting");

    // Then only the miss ran them, and only the miss reached the Origin.
    assertIdentical(hit.headers.get("x-cache"), "Hit from cloudfront");
    assertIdentical(requestRuns.count, 1);
    assertIdentical(responseRuns.count, 1);
    assertIdentical(reads.count, 1);
  });

  it("runs both viewer events on a hit", async () => {
    // Given a Behavior counting both of its viewer events, whose
    // viewer-response function marks what it saw.
    const simAws = new SimAws();
    const reads: OriginReads = { count: 0 };
    const requestRuns: EventRuns = { count: 0 };

    const distributionId = await distributionServing(
      simAws,
      await countingOrigin(simAws, reads),
      {
        TargetOriginId: "api",
        LambdaFunctionAssociations: {
          Quantity: 2,
          Items: [
            {
              EventType: "viewer-request",
              LambdaFunctionARN: await makeEdgeFunctionVersionArn({
                simAws,
                functionName: "counting-viewer-request",
                handler: (event: LambdaAtEdge.RequestEvent) => {
                  requestRuns.count += 1;

                  return event.Records[0].cf.request;
                },
              }),
            },
            {
              EventType: "viewer-response",
              LambdaFunctionARN: await makeEdgeFunctionVersionArn({
                simAws,
                functionName: "marking-viewer-response",
                handler: (event: LambdaAtEdge.ResponseEvent) => {
                  const { response } = event.Records[0].cf;
                  response.headers ??= {};
                  response.headers["x-viewer-response"] = [
                    {
                      key: "X-Viewer-Response",
                      value: response.headers["x-cache"]?.[0]?.value ?? "none",
                    },
                  ];

                  return response;
                },
              }),
            },
          ],
        },
      },
    );

    // When the same path is asked for twice.
    await simCfSiteRequest(simAws, distributionId, "/greeting");
    const hit = await simCfSiteRequest(simAws, distributionId, "/greeting");

    // Then the viewer-request function ran for both, and the viewer-response
    // function ran on the hit and saw the hit it was.
    assertIdentical(requestRuns.count, 2);
    assertIdentical(
      hit.headers.get("x-viewer-response"),
      "Hit from cloudfront",
    );
    assertIdentical(reads.count, 1);
  });

  it("applies the Behavior's response headers policy to a hit", async () => {
    // Given a Behavior on the managed SecurityHeadersPolicy, in front of an
    // Origin that sends none of its headers.
    const simAws = new SimAws();
    const reads: OriginReads = { count: 0 };
    const distributionId = await distributionServing(
      simAws,
      await countingOrigin(simAws, reads),
      {
        TargetOriginId: "api",
        ResponseHeadersPolicyId:
          simCfManagedResponseHeadersPolicyIds.securityHeaders,
      },
    );

    // When the same path is asked for twice.
    await simCfSiteRequest(simAws, distributionId, "/greeting");
    const hit = await simCfSiteRequest(simAws, distributionId, "/greeting");

    // Then the policy is on the cached answer as it was on the Origin's.
    assertIdentical(hit.headers.get("x-cache"), "Hit from cloudfront");
    assertIdentical(hit.headers.get("x-frame-options"), "SAMEORIGIN");
    assertIdentical(reads.count, 1);
  });
});
