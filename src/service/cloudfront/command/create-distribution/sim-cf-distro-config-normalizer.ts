import type {
  SimCloudFrontCacheBehaviorConfig,
  SimCloudFrontCustomErrorResponseConfig,
  SimCloudFrontDefaultCacheBehaviorConfig,
  SimCloudFrontDistributionConfig,
  SimCloudFrontFunctionAssociation,
  SimCloudFrontOriginConfig,
} from "./create-distribution.command.js";
import { isRecord } from "../../../../util/type-guard/record.js";
import { assertConsistentQuantity } from "../sim-cf-list-quantity.js";

interface SimCloudFrontConfigList<T> {
  readonly Items?: readonly T[] | undefined;
}

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
    const distributionConfig = this.distributionConfig as Record<
      string,
      object
    >;
    const cacheBehaviors = this.normalizeList<SimCloudFrontCacheBehaviorConfig>(
      "CacheBehaviors",
      distributionConfig["CacheBehaviors"],
    );

    return {
      ...this.distributionConfig,
      Aliases: this.normalizeList<string>(
        "Aliases",
        distributionConfig["Aliases"],
      ),
      Origins: this.normalizeList<SimCloudFrontOriginConfig>(
        "Origins",
        distributionConfig["Origins"],
      ),
      CustomErrorResponses:
        this.normalizeList<SimCloudFrontCustomErrorResponseConfig>(
          "CustomErrorResponses",
          distributionConfig["CustomErrorResponses"],
        ),
      DefaultCacheBehavior:
        this.distributionConfig.DefaultCacheBehavior === undefined
          ? undefined
          : this.normalizeCacheBehavior(
              this.distributionConfig.DefaultCacheBehavior,
            ),
      CacheBehaviors:
        cacheBehaviors === undefined
          ? undefined
          : {
              ...cacheBehaviors,
              Items: cacheBehaviors.Items?.map((cacheBehavior) =>
                this.normalizeCacheBehavior(cacheBehavior),
              ),
            },
    };
  }

  private normalizeCacheBehavior<T extends SimCloudFrontBehaviorConfig>(
    cacheBehavior: T,
  ): T {
    const cacheBehaviorRecord = cacheBehavior as Record<string, object>;

    return {
      ...cacheBehavior,
      FunctionAssociations:
        this.normalizeList<SimCloudFrontFunctionAssociation>(
          "FunctionAssociations",
          cacheBehaviorRecord["FunctionAssociations"],
        ),
    };
  }

  private normalizeList<T>(
    listName: string,
    value: unknown,
  ): SimCloudFrontConfigList<T> | undefined {
    if (value === undefined) {
      return undefined;
    }

    assertConsistentQuantity(listName, value);

    if (Array.isArray(value)) {
      return {
        Items: value as readonly T[],
      };
    }

    if (isRecord(value)) {
      return {
        ...value,
        // Keep downstream for..of iteration safe when Items is malformed.
        Items: Array.isArray(value["Items"])
          ? (value["Items"] as readonly T[])
          : undefined,
      };
    }

    /* v8 ignore next -- defensive fallback */
    return undefined;
  }
}
