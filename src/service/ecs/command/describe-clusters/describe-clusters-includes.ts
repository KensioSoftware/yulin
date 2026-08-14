import type { SimEcsClusterIncludes } from "../../cluster/sim-ecs-cluster.js";
import { SimEcsInvalidParameterException } from "../../error/sim-ecs.error.js";

/**
 * The `include` values a described cluster can answer for.
 *
 * `ATTACHMENTS` and `STATISTICS` are left out. Both describe capacity a
 * cluster has attached to it, and there is none here, so answering either one
 * would mean reporting made-up numbers as though they were counted.
 */
const answerable: ReadonlySet<string> = new Set([
  "SETTINGS",
  "CONFIGURATIONS",
  "TAGS",
]);

/**
 * Read what a `DescribeClusters` request asked to be reported.
 *
 * Real ECS leaves settings, configuration and tags out of a described cluster
 * unless the request asked for them by name, so a test asserting on tags it
 * did not ask for fails here as it would on AWS.
 */
export function describeClustersIncludes(
  include: readonly string[] | undefined,
): SimEcsClusterIncludes {
  const asked = include ?? [];

  for (const value of asked) {
    if (!answerable.has(value)) {
      throw new SimEcsInvalidParameterException(
        `DescribeClusters include ${value} is not simulated. A simulated ` +
          `cluster has no capacity attached to it to report.`,
      );
    }
  }

  return {
    settings: asked.includes("SETTINGS"),
    configuration: asked.includes("CONFIGURATIONS"),
    tags: asked.includes("TAGS"),
  };
}
