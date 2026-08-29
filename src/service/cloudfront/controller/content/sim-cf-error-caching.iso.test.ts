import {
  assertIdentical,
  assertResponseStatus,
  assertStringIncludes,
  assertStringNotIncludes,
  describeResponse,
} from "@kensio/smartass";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { LambdaAtEdge } from "../../typings/lambda-at-edge.namespace.js";
import { makeEdgeFunctionVersionArn } from "../../../../../test/cloudfront/edge-function-fixture.js";
import { simCfManagedCachePolicyIds } from "../../cache-policy/sim-cf-managed-cache-policies.js";
import {
  countingOrigin,
  distributionServing,
  type OriginReads,
  readNumber,
  statusSequenceOrigin,
} from "../../../../../test/cloudfront/cache-fixture.js";
import {
  simCfSiteBucket,
  simCfSiteDistributionConfig,
  simCfSiteDistributionId,
  simCfSiteRequest,
} from "../../../../../test/cloudfront/site-fixture.js";

describe("How long a sim CloudFront Distribution holds an error", () => {
  it("holds an Origin error for its custom error response's ErrorCachingMinTTL", async () => {
    // Given a Distribution holding a 500 for half a minute, in front of an
    // Origin failing its first read.
    const simAws = new SimAws();
    const reads: OriginReads = { count: 0 };
    const distributionId = await distributionServing(
      simAws,
      await statusSequenceOrigin(simAws, reads, [500, 200]),
      {},
      {
        CustomErrorResponses: {
          Quantity: 1,
          Items: [{ ErrorCode: 500, ErrorCachingMinTTL: 30 }],
        },
      },
    );
    const failed = await simCfSiteRequest(simAws, distributionId, "/greeting");

    // When the same path is asked for inside that half minute.
    await simAws.clock().advanceBy({ seconds: 29 });
    const held = await simCfSiteRequest(simAws, distributionId, "/greeting");

    // Then the cache answered with the error, and the Origin was left alone.
    assertResponseStatus(failed, 500, await describeResponse(failed));
    assertResponseStatus(held, 500, await describeResponse(held));
    assertIdentical(reads.count, 1);

    // And when simulated time moves past the half minute.
    await simAws.clock().advanceBy({ seconds: 2 });
    const recovered = await simCfSiteRequest(
      simAws,
      distributionId,
      "/greeting",
    );

    // Then the request reached the Origin, which had recovered.
    assertIdentical(await readNumber(recovered), 2);
  });

  it("holds an error it has no custom error response for, for ten seconds", async () => {
    // Given a Distribution configuring no custom error response at all, in
    // front of an Origin failing its first read.
    const simAws = new SimAws();
    const reads: OriginReads = { count: 0 };
    const distributionId = await distributionServing(
      simAws,
      await statusSequenceOrigin(simAws, reads, [503, 200]),
    );
    await simCfSiteRequest(simAws, distributionId, "/greeting");

    // When the same path is asked for inside CloudFront's ten seconds.
    await simAws.clock().advanceBy({ seconds: 9 });
    const held = await simCfSiteRequest(simAws, distributionId, "/greeting");

    // Then the cache answered with the error.
    assertResponseStatus(held, 503, await describeResponse(held));
    assertIdentical(reads.count, 1);

    // And when simulated time moves past the ten seconds.
    await simAws.clock().advanceBy({ seconds: 2 });
    const recovered = await simCfSiteRequest(
      simAws,
      distributionId,
      "/greeting",
    );

    // Then the request reached the Origin.
    assertIdentical(await readNumber(recovered), 2);
  });

  it("sends every request to the Origin where ErrorCachingMinTTL is zero", async () => {
    // Given a Distribution turning error caching off for a 500, in front of an
    // Origin failing twice.
    const simAws = new SimAws();
    const reads: OriginReads = { count: 0 };
    const distributionId = await distributionServing(
      simAws,
      await statusSequenceOrigin(simAws, reads, [500, 500]),
      {},
      {
        CustomErrorResponses: {
          Quantity: 1,
          Items: [{ ErrorCode: 500, ErrorCachingMinTTL: 0 }],
        },
      },
    );

    // When the same path is asked for three times, with no time passing.
    await simCfSiteRequest(simAws, distributionId, "/greeting");
    const second = await simCfSiteRequest(simAws, distributionId, "/greeting");
    const third = await simCfSiteRequest(simAws, distributionId, "/greeting");

    // Then every request reached the Origin, and the third one got its answer.
    assertResponseStatus(second, 500, await describeResponse(second));
    assertIdentical(await readNumber(third), 3);
    assertIdentical(reads.count, 3);
  });

  it("holds an error an origin-response function made of an Origin's answer", async () => {
    // Given a Behavior whose origin-response function answers 503 for the
    // Origin's 200.
    const simAws = new SimAws();
    const reads: OriginReads = { count: 0 };
    const versionArn = await makeEdgeFunctionVersionArn({
      simAws,
      functionName: "failing-origin-response",
      handler: (
        event: LambdaAtEdge.OriginResponseEvent,
      ): LambdaAtEdge.Response => ({
        ...event.Records[0].cf.response,
        status: "503",
        statusDescription: "Service Unavailable",
      }),
    });
    const distributionId = await distributionServing(
      simAws,
      await countingOrigin(simAws, reads),
      {
        TargetOriginId: "api",
        LambdaFunctionAssociations: {
          Quantity: 1,
          Items: [
            { EventType: "origin-response", LambdaFunctionARN: versionArn },
          ],
        },
      },
    );
    await simCfSiteRequest(simAws, distributionId, "/greeting");

    // When the same path is asked for inside CloudFront's ten seconds.
    await simAws.clock().advanceBy({ seconds: 9 });
    const held = await simCfSiteRequest(simAws, distributionId, "/greeting");

    // Then the error the function made was answered from the cache.
    assertResponseStatus(held, 503, await describeResponse(held));
    assertIdentical(reads.count, 1);

    // And when simulated time moves past the ten seconds.
    await simAws.clock().advanceBy({ seconds: 2 });
    await simCfSiteRequest(simAws, distributionId, "/greeting");

    // Then the request reached the Origin again.
    assertIdentical(reads.count, 2);
  });

  it("holds a custom error page for the rule that serves it", async () => {
    // Given a site serving one error page for a missing object, held for five
    // seconds.
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "held-error-site", {
      "404.html": "<h1>Not found here</h1>",
    });
    const distributionId = await simCfSiteDistributionId(
      simAws,
      simCfSiteDistributionConfig("held-error-site", {
        DefaultCacheBehavior: {
          TargetOriginId: "site-origin",
          ViewerProtocolPolicy: "allow-all",
          CachePolicyId: simCfManagedCachePolicyIds.cachingOptimized,
        },
        CustomErrorResponses: {
          Quantity: 1,
          Items: [
            {
              ErrorCode: 404,
              ResponsePagePath: "/404.html",
              ResponseCode: "404",
              ErrorCachingMinTTL: 5,
            },
          ],
        },
      }),
    );
    await simCfSiteRequest(simAws, distributionId, "/missing");

    // When the error page is taken out of the Bucket and the path is asked for
    // again inside the five seconds.
    await simAws.s3().deleteObject(
      new DeleteObjectCommand({
        Bucket: "held-error-site",
        Key: "404.html",
      }),
    );
    const held = await simCfSiteRequest(simAws, distributionId, "/missing");

    // Then the page came from the cache.
    assertStringIncludes(await held.text(), "Not found here");

    // And when simulated time moves past the five seconds.
    await simAws.clock().advanceBy({ seconds: 6 });
    const expired = await simCfSiteRequest(simAws, distributionId, "/missing");

    // Then the Distribution went back to the Origin, where the page has gone.
    assertStringNotIncludes(await expired.text(), "Not found here");
  });
});
