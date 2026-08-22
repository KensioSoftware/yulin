import type {
  SimCloudFrontCacheBehaviorConfig,
  SimCloudFrontDefaultCacheBehaviorConfig,
  SimCloudFrontFunctionAssociation,
  SimCloudFrontLambdaFunctionAssociation,
} from "./create-distribution.command.js";
import { simCfNormalizedList } from "./sim-cf-config-list.js";

type SimCloudFrontBehaviorConfig =
  | SimCloudFrontDefaultCacheBehaviorConfig
  | SimCloudFrontCacheBehaviorConfig;

/**
 * Read the lists one cache Behavior carries into the internal shape.
 *
 * Both kinds of edge function association arrive as a plain array from a
 * template and as `{ Quantity, Items }` from an SDK call. A list left
 * unnormalized here reaches the Behavior configurator with no `Items` on it,
 * and the functions it named are dropped without a word.
 */
export function simCfNormalizedCacheBehavior<
  T extends SimCloudFrontBehaviorConfig,
>(cacheBehavior: T): T {
  const record = cacheBehavior as Record<string, object>;

  return {
    ...cacheBehavior,
    FunctionAssociations: simCfNormalizedList<SimCloudFrontFunctionAssociation>(
      "FunctionAssociations",
      record["FunctionAssociations"],
    ),
    LambdaFunctionAssociations:
      simCfNormalizedList<SimCloudFrontLambdaFunctionAssociation>(
        "LambdaFunctionAssociations",
        record["LambdaFunctionAssociations"],
      ),
  };
}
