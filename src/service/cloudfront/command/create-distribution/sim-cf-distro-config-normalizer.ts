import type {
  SimCloudFrontCacheBehaviorConfig,
  SimCloudFrontCustomErrorResponseConfig,
  SimCloudFrontDistributionConfig,
  SimCloudFrontOriginConfig,
} from "./create-distribution.command.js";
import { simCfNormalizedCacheBehavior } from "./sim-cf-normalize-cache-behavior.js";
import { simCfNormalizedList } from "./sim-cf-config-list.js";

/**
 * Normalizes tolerated CloudFront DistributionConfig input shapes into the
 * simulator's internal CreateDistribution shape.
 *
 * This is forgiving: CloudFormation/CDK commonly emits array values for
 * list-like properties, while CloudFront SDK-style inputs use
 * `{ Items: [...] }` containers.
 */
export class SimCloudFrontDistributionConfigNormalizer {
  constructor(
    private readonly distributionConfig: SimCloudFrontDistributionConfig,
  ) {}

  /**
   * Normalize known list-like DistributionConfig fields.
   */
  normalize(): SimCloudFrontDistributionConfig {
    const distributionConfig = this.distributionConfig as Record<
      string,
      object
    >;
    const cacheBehaviors =
      simCfNormalizedList<SimCloudFrontCacheBehaviorConfig>(
        "CacheBehaviors",
        distributionConfig["CacheBehaviors"],
      );

    return {
      ...this.distributionConfig,
      Aliases: simCfNormalizedList<string>(
        "Aliases",
        distributionConfig["Aliases"],
      ),
      Origins: simCfNormalizedList<SimCloudFrontOriginConfig>(
        "Origins",
        distributionConfig["Origins"],
      ),
      CustomErrorResponses:
        simCfNormalizedList<SimCloudFrontCustomErrorResponseConfig>(
          "CustomErrorResponses",
          distributionConfig["CustomErrorResponses"],
        ),
      DefaultCacheBehavior:
        this.distributionConfig.DefaultCacheBehavior === undefined
          ? undefined
          : simCfNormalizedCacheBehavior(
              this.distributionConfig.DefaultCacheBehavior,
            ),
      CacheBehaviors:
        cacheBehaviors === undefined
          ? undefined
          : {
              ...cacheBehaviors,
              Items: cacheBehaviors.Items?.map((cacheBehavior) =>
                simCfNormalizedCacheBehavior(cacheBehavior),
              ),
            },
    };
  }
}
