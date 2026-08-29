import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimCloudFrontDistribution } from "../../distribution/sim-cloudfront-distribution.js";
import { SimCfInvalidation } from "../../invalidation/sim-cf-invalidation.js";
import {
  simCfInvalidationLocation,
  simCfInvalidationView,
} from "../../invalidation/sim-cf-invalidation-view.js";
import { simCfRepeatedInvalidation } from "../../invalidation/sim-cf-repeated-invalidation.js";
import { assertConsistentQuantity } from "../sim-cf-list-quantity.js";
import type { SimCfInvalidationAccess } from "./sim-cf-invalidation-access.js";
import type {
  SimCreateInvalidationCommand,
  SimCreateInvalidationCommandOutput,
} from "./sim-cf-invalidation-command.types.js";

/**
 * Simulated CloudFront CreateInvalidation command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudfront/command/CreateInvalidationCommand/
 */
export class SimCfCreateInvalidation {
  private static readonly action = "cloudfront:CreateInvalidation";

  constructor(private readonly access: SimCfInvalidationAccess) {}

  /**
   * Clear what a batch of paths names. The next request for one of them
   * reaches the Origin.
   *
   * The entries go as the invalidation is created. Real CloudFront clears each
   * point of presence over the following seconds, and a test waiting for that
   * before asking again would be waiting on the simulator.
   */
  async handle(
    command: SimCreateInvalidationCommand,
    options?: { readonly caller?: SimAwsCaller },
  ): Promise<SimCreateInvalidationCommandOutput> {
    const batch = command.input.InvalidationBatch;
    assertDefined(batch, "CreateInvalidationCommand.InvalidationBatch");
    const callerReference = batch.CallerReference;
    assertDefined(
      callerReference,
      "CreateInvalidationCommand.InvalidationBatch.CallerReference",
    );
    assertConsistentQuantity("InvalidationBatch.Paths", batch.Paths);

    await this.access.background.sequence();

    const distribution = this.access.authorizedDistribution(
      SimCfCreateInvalidation.action,
      command.input.DistributionId,
      options?.caller,
    );
    const paths = batch.Paths?.Items ?? [];
    const invalidation =
      simCfRepeatedInvalidation(distribution, callerReference, paths) ??
      this.invalidate(distribution, callerReference, paths);

    return {
      Location: simCfInvalidationLocation(
        distribution.distributionId,
        invalidation.invalidationId,
      ),
      Invalidation: simCfInvalidationView(invalidation),
      $metadata: {},
    };
  }

  /**
   * Create an invalidation, clear what it names, and start it running.
   */
  private invalidate(
    distribution: SimCloudFrontDistribution,
    callerReference: string,
    paths: readonly string[],
  ): SimCfInvalidation {
    const invalidation = new SimCfInvalidation({
      invalidationId: distribution.invalidations.allocateInvalidationId(),
      callerReference,
      paths,
      createTime: this.access.background.now(),
    });

    distribution.invalidations.add(invalidation);
    distribution.cache.clearPaths(paths);

    // The invalidation reaches Completed in the background, the way a
    // Distribution reaches Deployed.
    this.access.background.schedule(async () =>
      invalidation.completeInvalidation(),
    );

    return invalidation;
  }
}
