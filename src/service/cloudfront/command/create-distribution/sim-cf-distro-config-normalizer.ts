import type {
  SimCloudFrontCacheBehaviorConfig,
  SimCloudFrontDistributionConfig,
  SimCloudFrontOriginConfig,
} from "./create-distribution.cmd.js";
import { isRecord } from "../../../../util/type-guard/record.js";

interface SimCloudFrontConfigList<T> {
  readonly Items?: readonly T[] | undefined;
}

/**
 * Normalizes tolerated CloudFront DistributionConfig input shapes into the
 * simulator's internal CreateDistribution shape.
 *
 * This is intentionally forgiving: CloudFormation/CDK commonly emits array
 * values for list-like properties, while CloudFront SDK-style inputs use
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

    return {
      ...this.distributionConfig,
      Aliases: this.normalizeList<string>(distributionConfig["Aliases"]),
      Origins: this.normalizeList<SimCloudFrontOriginConfig>(
        distributionConfig["Origins"],
      ),
      CacheBehaviors: this.normalizeList<SimCloudFrontCacheBehaviorConfig>(
        distributionConfig["CacheBehaviors"],
      ),
    };
  }

  private normalizeList<T>(
    value: unknown,
  ): SimCloudFrontConfigList<T> | undefined {
    if (value === undefined) {
      return undefined;
    }

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
