import type {
  SimCloudFrontDistribution,
  SimCloudFrontDistributionId,
} from "./distribution/sim-cloudfront-distribution.js";
import { SimCloudFrontCaching } from "./sim-cloudfront-caching.js";
import type {
  SimCloudFrontDistributionMap,
  SimCloudFrontDistributionsById,
} from "./sim-cloudfront-commands.js";

/**
 * The Distributions one simulated CloudFront holds.
 *
 * The commands work on this map, and a test reads it back through these
 * accessors. `SimCloudFront` extends this, and a caller reaches the
 * Distributions on the one service object.
 */
export class SimCloudFrontDistributions extends SimCloudFrontCaching {
  protected readonly distributions: SimCloudFrontDistributionMap = new Map();

  /**
   * Get the simulated Distributions owned by this sim CloudFront service.
   */
  getDistributions(): SimCloudFrontDistributionsById {
    return this.distributions;
  }

  /**
   * Get a simulated CloudFront Distribution by ID.
   */
  getSimDistributionById(
    distributionId: SimCloudFrontDistributionId | string,
  ): SimCloudFrontDistribution | undefined {
    return this.distributions.get(
      distributionId as SimCloudFrontDistributionId,
    );
  }
}
