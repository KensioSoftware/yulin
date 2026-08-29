import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimCloudFrontCacheKey } from "../../cache-policy/sim-cf-cache-key.js";
import { SimCloudFrontCachePolicy } from "../../cache-policy/sim-cf-cache-policy.js";
import { simCfManagedCachePolicyIds } from "../../cache-policy/sim-cf-managed-cache-policies.js";
import {
  countingOrigin,
  distributionServing,
  type OriginReads,
  readNumber,
} from "../../../../../test/cloudfront/cache-fixture.js";
import { simCfSiteRequest } from "../../../../../test/cloudfront/site-fixture.js";

describe("What a sim CloudFront Distribution keys its cache on", () => {
  it("keys two requests apart on a query string its cache policy names", async () => {
    // Given a Behavior on a policy keying on the `page` query string.
    const simAws = new SimAws();
    const reads: OriginReads = { count: 0 };
    const policy = new SimCloudFrontCachePolicy({
      name: "PagedPolicy",
      cacheKey: new SimCloudFrontCacheKey({
        queryStringBehavior: "whitelist",
        queryStrings: ["page"],
      }),
    });

    simAws.cloudFront().addCachePolicy(policy);

    const distributionId = await distributionServing(
      simAws,
      await countingOrigin(simAws, reads),
      { TargetOriginId: "api", CachePolicyId: policy.id },
    );

    // When two requests differ in that query string, and the first is
    // repeated.
    const first = await simCfSiteRequest(
      simAws,
      distributionId,
      "/list?page=1",
    );
    const second = await simCfSiteRequest(
      simAws,
      distributionId,
      "/list?page=2",
    );
    const repeated = await simCfSiteRequest(
      simAws,
      distributionId,
      "/list?page=1",
    );

    // Then each page was read from the Origin once, and the repeat came from
    // the cache.
    assertIdentical(await readNumber(first), 1);
    assertIdentical(await readNumber(second), 2);
    assertIdentical(await readNumber(repeated), 1);
    assertIdentical(reads.count, 2);
  });

  it("shares one entry for two requests differing only in a query string the policy leaves out", async () => {
    // Given a Behavior on CachingOptimized, which keys on no query string.
    const simAws = new SimAws();
    const reads: OriginReads = { count: 0 };
    const distributionId = await distributionServing(
      simAws,
      await countingOrigin(simAws, reads),
    );

    // When two requests differ only in a campaign parameter.
    await simCfSiteRequest(simAws, distributionId, "/list?utm=email");
    const second = await simCfSiteRequest(
      simAws,
      distributionId,
      "/list?utm=social",
    );

    // Then the second is answered from the first one's entry.
    assertIdentical(await readNumber(second), 1);
    assertIdentical(reads.count, 1);
  });

  it("reaches the Origin every time on CachingDisabled", async () => {
    // Given a Behavior on the managed policy that caches nothing.
    const simAws = new SimAws();
    const reads: OriginReads = { count: 0 };
    const distributionId = await distributionServing(
      simAws,
      await countingOrigin(simAws, reads),
      {
        TargetOriginId: "api",
        CachePolicyId: simCfManagedCachePolicyIds.cachingDisabled,
      },
    );

    // When the same path is asked for twice.
    await simCfSiteRequest(simAws, distributionId, "/greeting");
    const second = await simCfSiteRequest(simAws, distributionId, "/greeting");

    // Then both reached the Origin.
    assertIdentical(await readNumber(second), 2);
    assertIdentical(reads.count, 2);
  });

  it("reaches the Origin every time for a method outside CachedMethods", async () => {
    // Given a Behavior allowing every method and caching GET and HEAD.
    const simAws = new SimAws();
    const reads: OriginReads = { count: 0 };
    const distributionId = await distributionServing(
      simAws,
      await countingOrigin(simAws, reads),
      {
        TargetOriginId: "api",
        AllowedMethods: {
          Quantity: 7,
          Items: ["GET", "HEAD", "OPTIONS", "PUT", "PATCH", "POST", "DELETE"],
          CachedMethods: { Quantity: 2, Items: ["GET", "HEAD"] },
        },
      },
    );

    // When the same path is posted to twice.
    await simCfSiteRequest(simAws, distributionId, "/greeting", {
      method: "POST",
    });
    const second = await simCfSiteRequest(simAws, distributionId, "/greeting", {
      method: "POST",
    });

    // Then both reached the Origin, since CloudFront caches no POST.
    assertIdentical(await readNumber(second), 2);
    assertIdentical(reads.count, 2);
  });
});
