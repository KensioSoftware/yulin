import type { SimCfnResource } from "../../resource/sim-cfn-resource.js";

/**
 * The order the Resources in one dependency batch are started in.
 *
 * CloudFormation creates Resources with no dependency between them in whatever
 * order it likes, so a template whose Resources only work in the order it wrote
 * them deploys some of the time. `template` is the order the template declared,
 * which is what a deployment does unless it is asked for something else.
 * `reversed` starts each batch from its last Resource, which is the other order
 * a pair with nothing between them could be created in.
 *
 * Dependencies are unaffected either way: a Resource still waits for everything
 * it refers to and everything its `DependsOn` names.
 */
export type SimCfnResourceOrder = "template" | "reversed";

/**
 * The Resources of one batch, in the order the deployment asked for.
 */
export function simCfnOrderedResources(
  resources: readonly SimCfnResource[],
  order: SimCfnResourceOrder | undefined,
): readonly SimCfnResource[] {
  return order === "reversed" ? resources.toReversed() : resources;
}
