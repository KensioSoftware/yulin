import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import {
  countingOrigin,
  distributionServing,
  type OriginReads,
} from "../../../../../test/cloudfront/cache-fixture.js";
import { simCfSiteRequest } from "../../../../../test/cloudfront/site-fixture.js";

describe("What a sim CloudFront answer says about the cache", () => {
  it("calls the first answer a miss and the second one a hit", async () => {
    // Given a Distribution on CachingOptimized, in front of an Origin.
    const simAws = new SimAws();
    const reads: OriginReads = { count: 0 };
    const distributionId = await distributionServing(
      simAws,
      await countingOrigin(simAws, reads),
    );

    // When the same path is asked for twice.
    const first = await simCfSiteRequest(simAws, distributionId, "/greeting");
    const second = await simCfSiteRequest(simAws, distributionId, "/greeting");

    // Then the Origin's answer is a miss and the cache's is a hit.
    assertIdentical(first.headers.get("x-cache"), "Miss from cloudfront");
    assertIdentical(second.headers.get("x-cache"), "Hit from cloudfront");
  });

  it("calls every answer a miss while caching is off", async () => {
    // Given a simulation with caching turned off.
    const simAws = new SimAws();
    simAws.cloudFront().configureCaching({ enabled: false });
    const reads: OriginReads = { count: 0 };
    const distributionId = await distributionServing(
      simAws,
      await countingOrigin(simAws, reads),
    );

    // When the same path is asked for twice.
    await simCfSiteRequest(simAws, distributionId, "/greeting");
    const second = await simCfSiteRequest(simAws, distributionId, "/greeting");

    // Then the second answer came from the Origin as the first one did.
    assertIdentical(second.headers.get("x-cache"), "Miss from cloudfront");
    assertIdentical(reads.count, 2);
  });

  it("ages a hit on the simulation's clock", async () => {
    // Given a path the Distribution has answered once and cached.
    const simAws = new SimAws();
    const reads: OriginReads = { count: 0 };
    const distributionId = await distributionServing(
      simAws,
      await countingOrigin(simAws, reads),
    );
    const miss = await simCfSiteRequest(simAws, distributionId, "/greeting");

    // Then the Origin's own answer carries no age.
    assertIdentical(miss.headers.get("age"), null);

    // And when simulated time moves on by half a minute.
    await simAws.clock().advanceBy({ seconds: 30 });
    const held = await simCfSiteRequest(simAws, distributionId, "/greeting");

    // Then the hit has been held for that long.
    assertIdentical(held.headers.get("age"), "30");

    // And when simulated time moves on again.
    await simAws.clock().advanceBy({ seconds: 45 });
    const older = await simCfSiteRequest(simAws, distributionId, "/greeting");

    // Then the age has grown with it, and the Origin was read once.
    assertIdentical(older.headers.get("age"), "75");
    assertIdentical(reads.count, 1);
  });
});
