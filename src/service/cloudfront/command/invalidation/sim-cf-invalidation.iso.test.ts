import {
  CreateInvalidationCommand,
  GetDistributionCommand,
  GetInvalidationCommand,
  ListInvalidationsCommand,
} from "@aws-sdk/client-cloudfront";
import {
  assertArrayEquals,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  countingOrigin,
  distributionServing,
  type OriginReads,
  readNumber,
} from "../../../../../test/cloudfront/cache-fixture.js";
import { simCfSiteRequest } from "../../../../../test/cloudfront/site-fixture.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { simCfEdgeHeaderName } from "../../cache/sim-cf-edge.js";
import {
  SimCloudFrontInvalidationBatchAlreadyExists,
  SimCloudFrontNoSuchInvalidation,
} from "../../error/sim-cf-invalidation.error.js";
import { SimCloudFrontNoSuchDistribution } from "../../error/sim-cloudfront.error.js";

/**
 * Ask a Distribution to clear a batch of paths.
 */
async function invalidatePaths(
  simAws: SimAws,
  distributionId: string,
  paths: readonly string[],
  callerReference = "deployment-1",
): Promise<string> {
  const invalidation = await simAws.cloudFront().createInvalidation(
    new CreateInvalidationCommand({
      DistributionId: distributionId,
      InvalidationBatch: {
        CallerReference: callerReference,
        Paths: { Quantity: paths.length, Items: [...paths] },
      },
    }),
  );

  assertNonNullable(invalidation.Invalidation?.Id);

  return invalidation.Invalidation.Id;
}

/**
 * A Distribution caching what an Origin that counts its reads serves.
 */
async function cachingDistribution(
  simAws: SimAws,
  reads: OriginReads,
): Promise<string> {
  return await distributionServing(simAws, await countingOrigin(simAws, reads));
}

describe("Invalidating what a sim CloudFront Distribution has cached", () => {
  it("clears the entry a path names, so the next request reaches the Origin", async () => {
    // Given a page the Distribution has cached.
    const simAws = new SimAws();
    const reads: OriginReads = { count: 0 };
    const distributionId = await cachingDistribution(simAws, reads);

    await simCfSiteRequest(simAws, distributionId, "/index.html");
    const cached = await simCfSiteRequest(
      simAws,
      distributionId,
      "/index.html",
    );

    // When the path it was cached under is invalidated.
    await invalidatePaths(simAws, distributionId, ["/index.html"]);

    // Then the next request for it reaches the Origin, where the one before
    // the invalidation did not.
    const afterwards = await simCfSiteRequest(
      simAws,
      distributionId,
      "/index.html",
    );

    assertIdentical(await readNumber(cached), 1);
    assertIdentical(await readNumber(afterwards), 2);
  });

  it("clears the entries below a wildcard and leaves the others", async () => {
    // Given two paths the Distribution has cached.
    const simAws = new SimAws();
    const reads: OriginReads = { count: 0 };
    const distributionId = await cachingDistribution(simAws, reads);

    await simCfSiteRequest(simAws, distributionId, "/images/logo.png");
    await simCfSiteRequest(simAws, distributionId, "/index.html");

    // When one of the two is invalidated by a wildcard above it.
    await invalidatePaths(simAws, distributionId, ["/images/*"]);

    const image = await simCfSiteRequest(
      simAws,
      distributionId,
      "/images/logo.png",
    );
    const page = await simCfSiteRequest(simAws, distributionId, "/index.html");

    // Then the image was read again and the page is still the cached one.
    assertIdentical(await readNumber(image), 3);
    assertIdentical(await readNumber(page), 2);
  });

  it("clears everything the Distribution holds", async () => {
    // Given two paths the Distribution has cached.
    const simAws = new SimAws();
    const reads: OriginReads = { count: 0 };
    const distributionId = await cachingDistribution(simAws, reads);

    await simCfSiteRequest(simAws, distributionId, "/index.html");
    await simCfSiteRequest(simAws, distributionId, "/about.html");

    // When the whole Distribution is invalidated.
    await invalidatePaths(simAws, distributionId, ["/*"]);

    await simCfSiteRequest(simAws, distributionId, "/index.html");
    await simCfSiteRequest(simAws, distributionId, "/about.html");

    // Then both were read from the Origin again.
    assertIdentical(reads.count, 4);
  });

  it("clears a path at every edge", async () => {
    // Given the same page cached at two points of presence.
    const simAws = new SimAws();
    const reads: OriginReads = { count: 0 };
    const distributionId = await cachingDistribution(simAws, reads);
    const atSecondEdge = {
      headers: { [simCfEdgeHeaderName]: "second-edge" },
    };

    await simCfSiteRequest(simAws, distributionId, "/index.html");
    await simCfSiteRequest(simAws, distributionId, "/index.html", atSecondEdge);

    // When the path is invalidated.
    await invalidatePaths(simAws, distributionId, ["/index.html"]);

    await simCfSiteRequest(simAws, distributionId, "/index.html");
    await simCfSiteRequest(simAws, distributionId, "/index.html", atSecondEdge);

    // Then both edges read the Origin again, since an invalidation reaches
    // every one of them rather than the edge that asked for it.
    assertIdentical(reads.count, 4);
  });

  it("starts InProgress and reaches Completed in the background", async () => {
    // Given a deployed Distribution.
    const simAws = new SimAws();
    const reads: OriginReads = { count: 0 };
    const distributionId = await cachingDistribution(simAws, reads);
    await simAws.backgroundTasksComplete();

    // When an invalidation is created.
    const creation = await simAws.cloudFront().createInvalidation(
      new CreateInvalidationCommand({
        DistributionId: distributionId,
        InvalidationBatch: {
          CallerReference: "deployment-1",
          Paths: { Quantity: 1, Items: ["/*"] },
        },
      }),
    );
    const running = await simAws
      .cloudFront()
      .getDistribution(new GetDistributionCommand({ Id: distributionId }));

    // Then it is running, and the Distribution counts it, until the
    // background scheduler finishes it.
    assertIdentical(creation.Invalidation?.Status, "InProgress");
    assertIdentical(running.Distribution?.InProgressInvalidationBatches, 1);

    await simAws.backgroundTasksComplete();

    assertNonNullable(creation.Invalidation.Id);
    const completed = await simAws.cloudFront().getInvalidation(
      new GetInvalidationCommand({
        DistributionId: distributionId,
        Id: creation.Invalidation.Id,
      }),
    );
    const settled = await simAws
      .cloudFront()
      .getDistribution(new GetDistributionCommand({ Id: distributionId }));

    assertIdentical(completed.Invalidation?.Status, "Completed");
    assertIdentical(settled.Distribution?.InProgressInvalidationBatches, 0);
  });

  it("reads an invalidation back with the batch it was created from", async () => {
    // Given an invalidation of two paths.
    const simAws = new SimAws();
    const reads: OriginReads = { count: 0 };
    const distributionId = await cachingDistribution(simAws, reads);
    const invalidationId = await invalidatePaths(simAws, distributionId, [
      "/index.html",
      "/images/*",
    ]);

    // When it is read back.
    const got = await simAws.cloudFront().getInvalidation(
      new GetInvalidationCommand({
        DistributionId: distributionId,
        Id: invalidationId,
      }),
    );

    // Then the paths and the caller reference are the ones it was given.
    assertIdentical(got.Invalidation?.Id, invalidationId);
    assertIdentical(
      got.Invalidation.InvalidationBatch.CallerReference,
      "deployment-1",
    );
    assertIdentical(got.Invalidation.InvalidationBatch.Paths.Quantity, 2);
    assertArrayEquals(got.Invalidation.InvalidationBatch.Paths.Items, [
      "/index.html",
      "/images/*",
    ]);
  });

  it("refuses an invalidation ID the Distribution does not hold", async () => {
    // Given a Distribution with no invalidations.
    const simAws = new SimAws();
    const reads: OriginReads = { count: 0 };
    const distributionId = await cachingDistribution(simAws, reads);

    // When an invalidation ID is asked for.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.cloudFront().getInvalidation(
          new GetInvalidationCommand({
            DistributionId: distributionId,
            Id: "INOSUCHINVALID",
          }),
        ),
    );

    // Then CloudFront answers that there is no such invalidation.
    assertInstanceOf(error, SimCloudFrontNoSuchInvalidation);
  });

  it("lists a Distribution's invalidations, newest first", async () => {
    // Given two invalidations of one Distribution.
    const simAws = new SimAws();
    const reads: OriginReads = { count: 0 };
    const distributionId = await cachingDistribution(simAws, reads);
    const first = await invalidatePaths(
      simAws,
      distributionId,
      ["/index.html"],
      "deployment-1",
    );
    const second = await invalidatePaths(
      simAws,
      distributionId,
      ["/about.html"],
      "deployment-2",
    );

    // When they are listed.
    const listing = await simAws
      .cloudFront()
      .listInvalidations(
        new ListInvalidationsCommand({ DistributionId: distributionId }),
      );

    // Then the most recent one is first, and the listing is not truncated.
    assertIdentical(listing.InvalidationList?.Quantity, 2);
    assertFalse(listing.InvalidationList.IsTruncated);
    assertArrayEquals(
      listing.InvalidationList.Items.map((invalidation) => invalidation.Id),
      [second, first],
    );
  });

  it("answers a repeated CallerReference with the invalidation it created", async () => {
    // Given an invalidation, and a page cached since it ran.
    const simAws = new SimAws();
    const reads: OriginReads = { count: 0 };
    const distributionId = await cachingDistribution(simAws, reads);
    const invalidationId = await invalidatePaths(simAws, distributionId, [
      "/index.html",
    ]);
    await simCfSiteRequest(simAws, distributionId, "/index.html");

    // When the same batch is sent again.
    const repeated = await invalidatePaths(simAws, distributionId, [
      "/index.html",
    ]);
    const afterwards = await simCfSiteRequest(
      simAws,
      distributionId,
      "/index.html",
    );
    const listing = await simAws
      .cloudFront()
      .listInvalidations(
        new ListInvalidationsCommand({ DistributionId: distributionId }),
      );

    // Then it answers with the invalidation already created, one exists, and
    // nothing was cleared a second time.
    assertIdentical(repeated, invalidationId);
    assertIdentical(listing.InvalidationList?.Quantity, 1);
    assertIdentical(await readNumber(afterwards), 1);
  });

  it("refuses a repeated CallerReference naming different paths", async () => {
    // Given an invalidation of one path.
    const simAws = new SimAws();
    const reads: OriginReads = { count: 0 };
    const distributionId = await cachingDistribution(simAws, reads);
    await invalidatePaths(simAws, distributionId, ["/index.html"]);

    // When the same caller reference names another path.
    const error = await assertThrowsErrorAsync(
      async () =>
        await invalidatePaths(simAws, distributionId, ["/about.html"]),
    );

    // Then the batch is refused, since the reference no longer names one
    // batch.
    assertInstanceOf(error, SimCloudFrontInvalidationBatchAlreadyExists);
  });

  it("takes a batch naming no paths, and clears nothing", async () => {
    // Given a page the Distribution has cached.
    const simAws = new SimAws();
    const reads: OriginReads = { count: 0 };
    const distributionId = await cachingDistribution(simAws, reads);
    await simCfSiteRequest(simAws, distributionId, "/index.html");

    // When an invalidation naming no paths at all is created.
    const creation = await simAws.cloudFront().createInvalidation(
      new CreateInvalidationCommand({
        DistributionId: distributionId,
        InvalidationBatch: {
          CallerReference: "empty-batch",
          Paths: undefined,
        },
      }),
    );
    const afterwards = await simCfSiteRequest(
      simAws,
      distributionId,
      "/index.html",
    );

    // Then it was created, and the cache still holds what it held.
    assertIdentical(creation.Invalidation?.InvalidationBatch.Paths.Quantity, 0);
    assertIdentical(await readNumber(afterwards), 1);
  });

  it("refuses an invalidation of a Distribution that does not exist", async () => {
    // Given a simulated CloudFront holding no Distributions.
    const simAws = new SimAws();

    // When an invalidation names one.
    const error = await assertThrowsErrorAsync(
      async () => await invalidatePaths(simAws, "ENOSUCHDISTRIB", ["/*"]),
    );

    // Then CloudFront answers that there is no such Distribution.
    assertInstanceOf(error, SimCloudFrontNoSuchDistribution);
  });
});
