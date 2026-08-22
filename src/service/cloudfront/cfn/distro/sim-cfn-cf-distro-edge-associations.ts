import type { SimAws } from "../../../aws/sim-aws.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCloudFrontCacheBehaviorConfig,
  SimCloudFrontDistributionConfig,
} from "../../command/create-distribution/create-distribution.command.js";
import { normalizeSimCfList } from "../../command/create-distribution/sim-cf-normalize-list.js";
import { SimCfnCfEdgeAssociationSkips } from "./sim-cfn-cf-edge-association-skips.js";

/**
 * The path a skipped association on the default Behavior is recorded under.
 */
const defaultBehaviorPath = "DistributionConfig.DefaultCacheBehavior";

/**
 * The DistributionConfig to deploy, without the Lambda@Edge associations this
 * simulation cannot run.
 *
 * Each association left out is recorded on `stack.ignoredProperties` under the
 * event type it was on, and `SimCfnCfEdgeAssociationSkips` decides which those
 * are. `CreateDistribution` takes the whole Distribution down over one of
 * them, and a Distribution that failed to deploy takes every request a local
 * dev server and a test suite make with it. That is the same reason an absent
 * `WebACLId` is left out here.
 *
 * The Behavior deploys with whatever is left and runs nothing at the event the
 * skipped association was on. A test that cares reads the record.
 */
export function simCfnCfDistroWithRunnableEdgeAssociations(
  resource: SimCfnResource,
  distributionConfig: SimCloudFrontDistributionConfig,
  simAws: SimAws,
): SimCloudFrontDistributionConfig {
  const skips = new SimCfnCfEdgeAssociationSkips(resource, simAws);
  const defaultCacheBehavior = distroDefaultBehavior(skips, distributionConfig);
  const cacheBehaviors = distroCacheBehaviors(skips, distributionConfig);

  if (skips.count === 0) {
    return distributionConfig;
  }

  return {
    ...distributionConfig,
    DefaultCacheBehavior: defaultCacheBehavior,
    CacheBehaviors: cacheBehaviors,
  };
}

/**
 * The default cache Behavior, without its unrunnable associations.
 */
function distroDefaultBehavior(
  skips: SimCfnCfEdgeAssociationSkips,
  distributionConfig: SimCloudFrontDistributionConfig,
): SimCloudFrontCacheBehaviorConfig | undefined {
  const behavior = distributionConfig.DefaultCacheBehavior;

  if (behavior === undefined) {
    return undefined;
  }

  return behaviorAssociations(skips, behavior, defaultBehaviorPath);
}

/**
 * Every path-based cache Behavior, each without its unrunnable associations.
 *
 * A Behavior is recorded under its `PathPattern`, in the terms the template
 * wrote it in. Its position is the fallback for a hand-written entry that left
 * the pattern out.
 */
function distroCacheBehaviors(
  skips: SimCfnCfEdgeAssociationSkips,
  distributionConfig: SimCloudFrontDistributionConfig,
): SimCloudFrontDistributionConfig["CacheBehaviors"] {
  const behaviors = normalizeSimCfList<SimCloudFrontCacheBehaviorConfig>(
    "CacheBehaviors",
    (distributionConfig as Record<string, unknown>)["CacheBehaviors"],
  );
  const items = behaviors?.Items;

  if (items === undefined) {
    return distributionConfig.CacheBehaviors;
  }

  return {
    ...behaviors,
    Items: items.map((behavior, index) =>
      behaviorAssociations(
        skips,
        behavior,
        `DistributionConfig.CacheBehaviors.${behavior.PathPattern ?? String(index)}`,
      ),
    ),
  };
}

/**
 * One Behavior, without the associations this simulation cannot run.
 */
function behaviorAssociations(
  skips: SimCfnCfEdgeAssociationSkips,
  behavior: SimCloudFrontCacheBehaviorConfig,
  behaviorPath: string,
): SimCloudFrontCacheBehaviorConfig {
  const runnable = skips.runnableAssociations(behavior, behaviorPath);

  if (runnable === undefined) {
    return behavior;
  }

  return {
    ...behavior,
    LambdaFunctionAssociations: {
      Quantity: runnable.length,
      Items: runnable,
    },
  };
}
