/**
 * A Distribution in front of an Origin that says which read answered it, for
 * tests about what its cache serves without reading the Origin again.
 *
 * This lives under `test/` for the same reasons as the rest of
 * `test/cloudfront/`. Eslint rejects an AWS SDK import from `src/` outside a
 * test file, and more than one suite needs the same steps.
 */

import {
  assertNonNullable,
  assertResponseStatus,
  assertTypeNumber,
  describeResponse,
} from "@kensio/smartass";
import {
  CreateDistributionCommand,
  type DefaultCacheBehavior,
} from "@aws-sdk/client-cloudfront";

import type { SimPayload2Event } from "../../src/serve/payload-2/sim-payload-2-event.type.js";
import type { SimAws } from "../../src/service/aws/sim-aws.js";
import { simCfManagedCachePolicyIds } from "../../src/service/cloudfront/cache-policy/sim-cf-managed-cache-policies.js";
import { customOrigin, functionUrlHostname } from "./edge-origin-fixture.js";

/**
 * How many times the Origin has been read, which is what a cache hit is
 * measured in. An answer the Distribution held already leaves this alone.
 */
export interface OriginReads {
  count: number;
}

/**
 * An Origin answering with the number of the read that answered, and with the
 * headers and body it was sent, so a test can tell one read from the next and
 * see what reached it.
 */
export async function countingOrigin(
  simAws: SimAws,
  reads: OriginReads,
): Promise<string> {
  return await functionUrlHostname(
    simAws,
    "counting-origin",
    (event: SimPayload2Event) => {
      reads.count += 1;

      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          read: reads.count,
          headers: event.headers,
          sent: event.body,
        }),
      };
    },
  );
}

/**
 * A Distribution serving that Origin, whose default Behavior is the one the
 * test is about. It caches on CachingOptimized unless the test says otherwise.
 */
export async function distributionServing(
  simAws: SimAws,
  originHostname: string,
  cacheBehavior: Partial<DefaultCacheBehavior> = {},
): Promise<string> {
  const creation = await simAws.cloudFront().createDistribution(
    new CreateDistributionCommand({
      DistributionConfig: {
        CallerReference: "cached-distribution",
        Comment: "Caching CDN",
        Enabled: true,
        Origins: {
          Quantity: 1,
          Items: [customOrigin("api", originHostname)],
        },
        DefaultCacheBehavior: {
          TargetOriginId: "api",
          ViewerProtocolPolicy: "allow-all",
          CachePolicyId: simCfManagedCachePolicyIds.cachingOptimized,
          ...cacheBehavior,
        },
      },
    }),
  );

  assertNonNullable(creation.Distribution?.Id, "the Distribution was created");

  return creation.Distribution.Id;
}

/**
 * The read number an answer came from, which stays where it was while the
 * cache is answering.
 */
export async function readNumber(response: Response): Promise<number> {
  assertResponseStatus(response, 200, await describeResponse(response));

  const { read } = (await response.json()) as { read: number };

  assertTypeNumber(read);

  return read;
}

/**
 * An Origin answering with a status per read, so that a test can have the
 * first read fail and the second one answer.
 */
export async function statusSequenceOrigin(
  simAws: SimAws,
  reads: OriginReads,
  statusCodes: readonly number[],
): Promise<string> {
  return await functionUrlHostname(simAws, "sequence-origin", () => {
    reads.count += 1;

    const statusCode = statusCodes[reads.count - 1] ?? 200;

    return {
      statusCode,
      headers: { "content-type": "application/json" },
      // A 204 says there is no content, so it answers with none.
      body: statusCode === 204 ? "" : JSON.stringify({ read: reads.count }),
    };
  });
}
