import { DynamicFactory } from "@kensio/part-factory";
import type { TerraformResource } from "../../../src/terraform/sim-tf-resource.type.js";

/**
 * Makes the joined form of one resource, as `terraformPlanResources` reads it
 * out of the three sections a plan splits it across.
 *
 * A test of the reader builds a plan and reads it. This is for a test of what
 * happens afterwards, where a resource is what a reference is read from rather
 * than what is being read:
 *
 * ```typescript
 * resolver.resolve(
 *   "each.value.uri",
 *   terraformResourceFactory.make({
 *     modulePath: ["api"],
 *     forEach: ["var.routes"],
 *   }),
 * );
 * ```
 */
export const terraformResourceFactory = new DynamicFactory<TerraformResource>(
  (overrides = {}) => {
    const type = overrides.type ?? "aws_sqs_queue";
    const name = overrides.name ?? "orders";

    return {
      address: `${type}.${name}`,
      type,
      name,
      index: undefined,
      provider: "hashicorp/aws",
      values: {},
      unknown: {},
      expressions: {},
      dependsOn: [],
      forEach: [],
      modulePath: [],
    };
  },
);
