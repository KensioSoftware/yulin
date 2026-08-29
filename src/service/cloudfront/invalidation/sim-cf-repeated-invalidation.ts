import type { SimCloudFrontDistribution } from "../distribution/sim-cloudfront-distribution.js";
import { SimCloudFrontInvalidationBatchAlreadyExists } from "../error/sim-cf-invalidation.error.js";
import type { SimCfInvalidation } from "./sim-cf-invalidation.js";

/**
 * The invalidation a `CallerReference` already created, where a batch repeats
 * it.
 *
 * A `CallerReference` makes a batch idempotent. A repeat naming the same paths
 * is answered with what it created the first time, and nothing is cleared
 * again. A repeat naming different paths is refused, since the reference then
 * names two batches.
 *
 * A reference this Distribution has never seen answers with nothing, and the
 * caller creates an invalidation for it.
 */
export function simCfRepeatedInvalidation(
  distribution: SimCloudFrontDistribution,
  callerReference: string,
  paths: readonly string[],
): SimCfInvalidation | undefined {
  const existing =
    distribution.invalidations.byCallerReference(callerReference);

  if (existing === undefined) {
    return undefined;
  }

  if (!existing.namesSamePaths(paths)) {
    throw new SimCloudFrontInvalidationBatchAlreadyExists(
      `Sim CloudFront invalidation batch ${existing.invalidationId} on Distribution ${distribution.distributionId} was created with CallerReference ${callerReference} and different paths`,
    );
  }

  return existing;
}
