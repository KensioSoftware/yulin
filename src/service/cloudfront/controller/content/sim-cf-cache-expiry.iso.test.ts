import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimCloudFrontCachePolicy } from "../../cache-policy/sim-cf-cache-policy.js";
import {
  cacheHeaderOrigin,
  countingOrigin,
  distributionServing,
  type OriginReads,
  readNumber,
} from "../../../../../test/cloudfront/cache-fixture.js";
import { simCfSiteRequest } from "../../../../../test/cloudfront/site-fixture.js";

/**
 * A policy of the simulation's own, for the TTLs a managed one does not carry.
 */
function beaconPolicy(
  simAws: SimAws,
  ttls: { minTtlSec: number; defaultTtlSec: number; maxTtlSec: number },
): string {
  const policy = new SimCloudFrontCachePolicy({
    name: "BeaconPolicy",
    ...ttls,
  });
  simAws.cloudFront().addCachePolicy(policy);

  return policy.id;
}

describe("When a sim CloudFront Distribution's cached object expires", () => {
  it("reaches the Origin once the max-age it asked for has passed", async () => {
    // Given a Distribution in front of an Origin holding its answers for a
    // minute.
    const simAws = new SimAws();
    const reads: OriginReads = { count: 0 };
    const distributionId = await distributionServing(
      simAws,
      await cacheHeaderOrigin(simAws, reads, { "cache-control": "max-age=60" }),
    );
    await simCfSiteRequest(simAws, distributionId, "/beacon");

    // When simulated time moves on by less than that minute.
    await simAws.clock().advanceBy({ seconds: 59 });
    const held = await simCfSiteRequest(simAws, distributionId, "/beacon");

    // Then the cache is still answering.
    assertIdentical(await readNumber(held), 1);
    assertIdentical(reads.count, 1);

    // And when simulated time moves past the minute.
    await simAws.clock().advanceBy({ seconds: 2 });
    const expired = await simCfSiteRequest(simAws, distributionId, "/beacon");

    // Then the request reached the Origin.
    assertIdentical(await readNumber(expired), 2);
    assertIdentical(reads.count, 2);
  });

  it("holds an answer carrying no cache header for the policy's default TTL", async () => {
    // Given a Distribution on CachingOptimized, whose default TTL is a day, in
    // front of an Origin that asks for nothing.
    const simAws = new SimAws();
    const reads: OriginReads = { count: 0 };
    const distributionId = await distributionServing(
      simAws,
      await countingOrigin(simAws, reads),
    );
    await simCfSiteRequest(simAws, distributionId, "/greeting");

    // When simulated time moves on by less than a day.
    await simAws.clock().advanceBy({ hours: 23 });
    const held = await simCfSiteRequest(simAws, distributionId, "/greeting");

    // Then the cache is still answering.
    assertIdentical(await readNumber(held), 1);

    // And when simulated time moves past the day.
    await simAws.clock().advanceBy({ hours: 2 });
    const expired = await simCfSiteRequest(simAws, distributionId, "/greeting");

    // Then the request reached the Origin.
    assertIdentical(await readNumber(expired), 2);
  });

  it("replaces the expired entry with what the Origin answers next", async () => {
    // Given a Distribution whose only cached answer has expired.
    const simAws = new SimAws();
    const reads: OriginReads = { count: 0 };
    const distributionId = await distributionServing(
      simAws,
      await cacheHeaderOrigin(simAws, reads, { "cache-control": "max-age=60" }),
    );
    await simCfSiteRequest(simAws, distributionId, "/beacon");
    await simAws.clock().advanceBy({ seconds: 61 });
    await simCfSiteRequest(simAws, distributionId, "/beacon");

    // When the same path is asked for again inside the new minute.
    await simAws.clock().advanceBy({ seconds: 30 });
    const served = await simCfSiteRequest(simAws, distributionId, "/beacon");

    // Then the second read is what the cache holds. The first one is gone.
    assertIdentical(await readNumber(served), 2);
    assertIdentical(reads.count, 2);
  });

  it("stores nothing an Origin refused, where the policy has no floor", async () => {
    // Given a policy that would hold an answer for an hour, and an Origin
    // asking for its answers not to be stored.
    const simAws = new SimAws();
    const reads: OriginReads = { count: 0 };
    const originHostname = await cacheHeaderOrigin(simAws, reads, {
      "cache-control": "no-store",
    });
    const distributionId = await distributionServing(simAws, originHostname, {
      CachePolicyId: beaconPolicy(simAws, {
        minTtlSec: 0,
        defaultTtlSec: 3600,
        maxTtlSec: 86_400,
      }),
    });

    // When the same path is asked for twice, with no time passing between.
    await simCfSiteRequest(simAws, distributionId, "/beacon");
    const second = await simCfSiteRequest(simAws, distributionId, "/beacon");

    // Then both requests reached the Origin.
    assertIdentical(await readNumber(second), 2);
    assertIdentical(reads.count, 2);
  });

  it("holds an answer an Origin refused for the policy's MinTTL", async () => {
    // Given a policy holding nothing for less than five minutes, in front of
    // an Origin asking for its answers not to be stored.
    const simAws = new SimAws();
    const reads: OriginReads = { count: 0 };
    const originHostname = await cacheHeaderOrigin(simAws, reads, {
      "cache-control": "no-store",
    });
    const distributionId = await distributionServing(simAws, originHostname, {
      CachePolicyId: beaconPolicy(simAws, {
        minTtlSec: 300,
        defaultTtlSec: 3600,
        maxTtlSec: 86_400,
      }),
    });
    await simCfSiteRequest(simAws, distributionId, "/beacon");

    // When simulated time moves on by less than the floor.
    await simAws.clock().advanceBy({ seconds: 299 });
    const held = await simCfSiteRequest(simAws, distributionId, "/beacon");

    // Then the floor overrode the Origin, as it does in CloudFront.
    assertIdentical(await readNumber(held), 1);

    // And when simulated time moves past the floor.
    await simAws.clock().advanceBy({ seconds: 2 });
    const expired = await simCfSiteRequest(simAws, distributionId, "/beacon");

    // Then the request reached the Origin.
    assertIdentical(await readNumber(expired), 2);
  });

  it("caps what an Origin asked for at the policy's MaxTTL", async () => {
    // Given a policy holding nothing for longer than a minute, in front of an
    // Origin asking for an hour.
    const simAws = new SimAws();
    const reads: OriginReads = { count: 0 };
    const originHostname = await cacheHeaderOrigin(simAws, reads, {
      "cache-control": "max-age=3600",
    });
    const distributionId = await distributionServing(simAws, originHostname, {
      CachePolicyId: beaconPolicy(simAws, {
        minTtlSec: 0,
        defaultTtlSec: 60,
        maxTtlSec: 60,
      }),
    });
    await simCfSiteRequest(simAws, distributionId, "/beacon");

    // When simulated time moves past the ceiling but not past the hour.
    await simAws.clock().advanceBy({ seconds: 61 });
    const expired = await simCfSiteRequest(simAws, distributionId, "/beacon");

    // Then the request reached the Origin.
    assertIdentical(await readNumber(expired), 2);
  });
});
