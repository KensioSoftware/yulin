import type {
  SimCloudFrontCacheBehaviorConfig,
  SimCloudFrontCustomErrorResponseConfig,
  SimCloudFrontDefaultCacheBehaviorConfig,
  SimCloudFrontDistributionConfig,
  SimCloudFrontFunctionAssociation,
  SimCloudFrontLambdaFunctionAssociation,
  SimCloudFrontOriginConfig,
} from "./create-distribution.command.js";
import {
  normalizeSimCfList,
  normalizeSimCfListItems,
} from "./sim-cf-normalize-list.js";
import { normalizeSimCfOrigin } from "./sim-cf-normalize-origin.js";

type SimCloudFrontBehaviorConfig =
  | SimCloudFrontDefaultCacheBehaviorConfig
  | SimCloudFrontCacheBehaviorConfig;

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
    const config = this.distributionConfig as Record<string, object>;

    return {
      ...this.distributionConfig,
      Aliases: normalizeSimCfList<string>("Aliases", config["Aliases"]),
      Origins: normalizeSimCfListItems<SimCloudFrontOriginConfig>(
        "Origins",
        config["Origins"],
        normalizeSimCfOrigin,
      ),
      CustomErrorResponses:
        normalizeSimCfList<SimCloudFrontCustomErrorResponseConfig>(
          "CustomErrorResponses",
          config["CustomErrorResponses"],
        ),
      DefaultCacheBehavior:
        this.distributionConfig.DefaultCacheBehavior === undefined
          ? undefined
          : this.normalizeCacheBehavior(
              this.distributionConfig.DefaultCacheBehavior,
            ),
      CacheBehaviors: normalizeSimCfListItems<SimCloudFrontCacheBehaviorConfig>(
        "CacheBehaviors",
        config["CacheBehaviors"],
        (behavior) => this.normalizeCacheBehavior(behavior),
      ),
    };
  }

  private normalizeCacheBehavior<T extends SimCloudFrontBehaviorConfig>(
    cacheBehavior: T,
  ): T {
    const cacheBehaviorRecord = cacheBehavior as Record<string, object>;

    return {
      ...cacheBehavior,
      FunctionAssociations:
        normalizeSimCfList<SimCloudFrontFunctionAssociation>(
          "FunctionAssociations",
          cacheBehaviorRecord["FunctionAssociations"],
        ),
      LambdaFunctionAssociations:
        normalizeSimCfList<SimCloudFrontLambdaFunctionAssociation>(
          "LambdaFunctionAssociations",
          cacheBehaviorRecord["LambdaFunctionAssociations"],
        ),
    };
  }
}
