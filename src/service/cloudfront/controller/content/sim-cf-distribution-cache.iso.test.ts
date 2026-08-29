import {
  assertIdentical,
  assertResponseStatus,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import {
  countingOrigin,
  distributionServing,
  type OriginReads,
  readNumber,
  statusSequenceOrigin,
} from "../../../../../test/cloudfront/cache-fixture.js";
import { simCfSiteRequest } from "../../../../../test/cloudfront/site-fixture.js";

describe("What a sim CloudFront Distribution caches", () => {
  it("answers a second request for the same key without reaching the Origin", async () => {
    // Given a Distribution on CachingOptimized, in front of an Origin that
    // says which read answered.
    const simAws = new SimAws();
    const reads: OriginReads = { count: 0 };
    const distributionId = await distributionServing(
      simAws,
      await countingOrigin(simAws, reads),
    );

    // When the same path is asked for twice.
    const first = await simCfSiteRequest(simAws, distributionId, "/greeting");
    const second = await simCfSiteRequest(simAws, distributionId, "/greeting");

    // Then the second answer is the first one, and the Origin was read once.
    assertIdentical(await readNumber(first), 1);
    assertIdentical(await readNumber(second), 1);
    assertIdentical(reads.count, 1);
  });

  it("caches a response that carries no body", async () => {
    // Given an Origin answering 204 the first time and 200 after that.
    const simAws = new SimAws();
    const reads: OriginReads = { count: 0 };
    const distributionId = await distributionServing(
      simAws,
      await statusSequenceOrigin(simAws, reads, [204, 200]),
    );

    // When the same path is asked for twice.
    await simCfSiteRequest(simAws, distributionId, "/beacon");
    const second = await simCfSiteRequest(simAws, distributionId, "/beacon");

    // Then the empty answer was held on to and served again.
    assertResponseStatus(second, 204, await describeResponse(second));
    assertIdentical(reads.count, 1);
  });

  it("stores nothing for an Origin error", async () => {
    // Given an Origin failing the first read and answering the second.
    const simAws = new SimAws();
    const reads: OriginReads = { count: 0 };
    const distributionId = await distributionServing(
      simAws,
      await statusSequenceOrigin(simAws, reads, [500, 200]),
    );

    // When the failing answer is asked for again.
    const failed = await simCfSiteRequest(simAws, distributionId, "/greeting");
    const second = await simCfSiteRequest(simAws, distributionId, "/greeting");

    // Then the error was not held on to, and the second read answered.
    assertResponseStatus(failed, 500, await describeResponse(failed));
    assertIdentical(await readNumber(second), 2);
  });
});
