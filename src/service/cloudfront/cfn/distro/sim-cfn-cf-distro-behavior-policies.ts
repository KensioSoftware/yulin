import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCloudFrontCacheBehaviorConfig,
  SimCloudFrontDistributionConfig,
} from "../../command/create-distribution/create-distribution.command.js";
import { normalizeSimCfList } from "../../command/create-distribution/sim-cf-normalize-list.js";
import type { SimCloudFront } from "../../sim-cloudfront.js";
import { SimCfnCfDistroPolicyDrops } from "./sim-cfn-cf-distro-policy-drops.js";

/**
 * The path a dropped policy on the default Behavior is recorded under.
 */
const defaultBehaviorPath = "DistributionConfig.DefaultCacheBehavior";

/**
 * The DistributionConfig to deploy, without a policy ID naming a response
 * headers policy, a cache policy or an origin request policy this simulation
 * does not hold.
 *
 * `CreateDistribution` refuses such an ID, as real CloudFront refuses one, and
 * a Distribution deployed from a template is the one place that refusal costs
 * more than it is worth. A stack naming a policy from a real account is
 * ordinary, and so is one naming a policy another stack created. Neither says
 * anything about the site the Distribution serves, and a Distribution that
 * failed to deploy takes every request a local dev server and a test suite
 * make with it. That is the same reason an absent `WebACLId` is left out here.
 *
 * So the property is left off that Behavior and recorded on
 * `stack.ignoredProperties`. The Behavior deploys, and a test that cares reads
 * the record. CloudFront's managed policies count as held, so a Behavior
 * naming one keeps it.
 *
 * One Behavior losing a policy leaves the others holding theirs, and a
 * Behavior losing one kind of policy keeps the others.
 */
export function simCfnCfDistroWithHeldBehaviorPolicies(
  resource: SimCfnResource,
  distributionConfig: SimCloudFrontDistributionConfig,
  cloudFront: SimCloudFront,
): SimCloudFrontDistributionConfig {
  const drops = new SimCfnCfDistroPolicyDrops(resource, cloudFront);
  const defaultCacheBehavior = distroDefaultBehavior(drops, distributionConfig);
  const cacheBehaviors = distroCacheBehaviors(drops, distributionConfig);

  if (drops.count === 0) {
    return distributionConfig;
  }

  return {
    ...distributionConfig,
    DefaultCacheBehavior: defaultCacheBehavior,
    CacheBehaviors: cacheBehaviors,
  };
}

/**
 * The default cache Behavior, without a policy that is not here.
 */
function distroDefaultBehavior(
  drops: SimCfnCfDistroPolicyDrops,
  distributionConfig: SimCloudFrontDistributionConfig,
): SimCloudFrontCacheBehaviorConfig | undefined {
  const behavior = distributionConfig.DefaultCacheBehavior;

  if (behavior === undefined) {
    return undefined;
  }

  return drops.heldPolicies(behavior, defaultBehaviorPath);
}

/**
 * Every path-based cache Behavior, each without a policy that is not here.
 *
 * A Behavior is recorded under its `PathPattern`, in the terms the template
 * wrote it in, the way a skipped Lambda@Edge association is. Its position is
 * the fallback for a hand-written entry that left the pattern out.
 */
function distroCacheBehaviors(
  drops: SimCfnCfDistroPolicyDrops,
  distributionConfig: SimCloudFrontDistributionConfig,
): SimCloudFrontDistributionConfig["CacheBehaviors"] {
  const behaviors = normalizeSimCfList<SimCloudFrontCacheBehaviorConfig>(
    "CacheBehaviors",
    distributionConfig.CacheBehaviors,
  );
  const items = behaviors?.Items;

  if (items === undefined) {
    return distributionConfig.CacheBehaviors;
  }

  return {
    ...behaviors,
    Items: items.map((behavior, index) =>
      drops.heldPolicies(
        behavior,
        `DistributionConfig.CacheBehaviors.${behavior.PathPattern ?? String(index)}`,
      ),
    ),
  };
}
