import type { SimCfCustomOriginDispatcher } from "../../origin/custom/sim-cf-custom-origin-dispatcher.js";
import type { SimCloudFrontS3OriginResolver } from "../../origin/s3/sim-cloudfront-s3-origin.js";
import { SimCloudFrontBehaviorConfigurator } from "./sim-cloud-front-behavior-configurator.js";
import { SimCloudFrontDistributionConfigurator } from "./sim-cloud-front-distribution-configurator.js";
import { SimCloudFrontOriginConfigurator } from "./sim-cloud-front-origin-configurator.js";

interface SimCloudFrontConfiguratorOrigins {
  readonly s3OriginResolver: SimCloudFrontS3OriginResolver;
  readonly customOriginDispatcher?: SimCfCustomOriginDispatcher | undefined;
}

/**
 * Build the configurator that applies a DistributionConfig to a Distribution.
 *
 * Creation and update apply the same config the same way, so they build the
 * same set of configurators.
 */
export function makeSimCloudFrontDistributionConfigurator(
  origins: SimCloudFrontConfiguratorOrigins,
): SimCloudFrontDistributionConfigurator {
  return new SimCloudFrontDistributionConfigurator(
    new SimCloudFrontOriginConfigurator(
      origins.s3OriginResolver,
      origins.customOriginDispatcher,
    ),
    new SimCloudFrontBehaviorConfigurator(),
  );
}
