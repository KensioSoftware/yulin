import {
  assertIdentical,
  assertStringIncludes,
  assertStringNotIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { simCfEdgeHeaderName } from "../../cache/sim-cf-edge.js";
import { SimCloudFrontResponseHeader } from "../../response-headers-policy/sim-cf-response-header.js";
import {
  SimCloudFrontResponseHeadersPolicy,
  type SimCloudFrontResponseHeadersPolicyId,
} from "../../response-headers-policy/sim-cf-response-headers-policy.js";
import {
  countingOrigin,
  distributionServing,
  type OriginReads,
  readNumber,
} from "../../../../../test/cloudfront/cache-fixture.js";
import { simCfSiteRequest } from "../../../../../test/cloudfront/site-fixture.js";

describe("A sim CloudFront edge cache", () => {
  it("misses at an edge the answer was not stored at, and tells the Origin nothing about it", async () => {
    // Given a Distribution that has answered a request at its default edge.
    const simAws = new SimAws();
    const reads: OriginReads = { count: 0 };
    const distributionId = await distributionServing(
      simAws,
      await countingOrigin(simAws, reads),
    );

    await simCfSiteRequest(simAws, distributionId, "/greeting");

    // When the same request arrives at another point of presence.
    const elsewhere = await simCfSiteRequest(
      simAws,
      distributionId,
      "/greeting",
      { headers: { [simCfEdgeHeaderName]: "edge-two" } },
    );

    // Then that edge had nothing cached and read the Origin.
    assertIdentical(await readNumber(elsewhere), 2);

    // And the Origin was never told which edge it was answering, since the
    // header is an instruction to the simulator rather than part of the
    // request being simulated.
    const repeated = await simCfSiteRequest(
      simAws,
      distributionId,
      "/greeting",
      { headers: { [simCfEdgeHeaderName]: "edge-three" } },
    );

    assertStringNotIncludes(await repeated.text(), simCfEdgeHeaderName);
  });

  it("sends the Origin the body of a request that named an edge", async () => {
    // Given a Distribution in front of an Origin that says what it was sent.
    const simAws = new SimAws();
    const reads: OriginReads = { count: 0 };
    const distributionId = await distributionServing(
      simAws,
      await countingOrigin(simAws, reads),
    );

    // When a POST carrying a body names an edge.
    const posted = await simCfSiteRequest(simAws, distributionId, "/greeting", {
      method: "POST",
      body: "a body the Origin should see",
      headers: { [simCfEdgeHeaderName]: "edge-four" },
    });

    // Then taking the header off the request left the body where it was.
    assertStringIncludes(await posted.text(), "a body the Origin should see");
  });

  it("reaches the Origin every time once caching is turned off", async () => {
    // Given a simulated AWS whose Distributions hold no cache.
    const simAws = new SimAws();
    const reads: OriginReads = { count: 0 };
    const distributionId = await distributionServing(
      simAws,
      await countingOrigin(simAws, reads),
    );

    simAws.cloudFront().configureCaching({ enabled: false });

    // When the same path is asked for twice.
    await simCfSiteRequest(simAws, distributionId, "/greeting");
    const second = await simCfSiteRequest(simAws, distributionId, "/greeting");

    // Then both reached the Origin, as they did before a Distribution held a
    // cache at all.
    assertIdentical(await readNumber(second), 2);
    assertIdentical(reads.count, 2);
  });

  it("applies the response headers policy a Behavior names now, not the one it named when the answer was stored", async () => {
    // Given a Behavior whose response headers policy sets a header.
    const simAws = new SimAws();
    const reads: OriginReads = { count: 0 };
    const policyId =
      "22222222-3333-4444-5555-666666666666" as SimCloudFrontResponseHeadersPolicyId;

    simAws.cloudFront().addResponseHeadersPolicy(
      new SimCloudFrontResponseHeadersPolicy({
        id: policyId,
        name: "CacheHeaders",
        customHeaders: [
          new SimCloudFrontResponseHeader({
            name: "x-served-by",
            value: "first-policy",
          }),
        ],
      }),
    );

    const distributionId = await distributionServing(
      simAws,
      await countingOrigin(simAws, reads),
      { TargetOriginId: "api", ResponseHeadersPolicyId: policyId },
    );

    await simCfSiteRequest(simAws, distributionId, "/greeting");

    // When the policy is replaced and the cached answer is asked for again.
    simAws.cloudFront().removeResponseHeadersPolicy(policyId);
    simAws.cloudFront().addResponseHeadersPolicy(
      new SimCloudFrontResponseHeadersPolicy({
        id: policyId,
        name: "CacheHeaders",
        customHeaders: [
          new SimCloudFrontResponseHeader({
            name: "x-served-by",
            value: "second-policy",
          }),
        ],
      }),
    );

    const second = await simCfSiteRequest(simAws, distributionId, "/greeting");

    // Then the hit carries the new policy's header, because CloudFront applies
    // a policy on the way out of the cache rather than storing it with the
    // response. A policy change therefore needs no invalidation.
    assertIdentical(await readNumber(second), 1);
    assertIdentical(second.headers.get("x-served-by"), "second-policy");
  });
});
