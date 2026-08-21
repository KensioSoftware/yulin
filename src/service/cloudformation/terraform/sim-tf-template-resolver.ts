import type { TerraformPlan } from "./sim-tf-plan.type.js";
import type { TerraformResource } from "./sim-tf-plan-resources.js";
import { TerraformReferenceResolver } from "./sim-tf-reference.js";
import { terraformModuleOutputs } from "./sim-tf-module-outputs.js";
import { terraformResourceMappings } from "./sim-tf-registry.js";

const awsProvider = "hashicorp/aws";

/**
 * A resolver over the resources that become a CloudFormation Resource.
 *
 * A reference to a type with no mapping would otherwise produce an intrinsic
 * naming a logical ID the template never declares, and the property carrying it
 * would reach the service factory as an object where a string was wanted.
 */
export function mappableResolver(
  plan: TerraformPlan,
  resources: readonly TerraformResource[],
): TerraformReferenceResolver {
  const mappable = resources.filter(
    (resource) =>
      resource.provider === awsProvider &&
      terraformResourceMappings.has(resource.type),
  );

  return new TerraformReferenceResolver(mappable, terraformModuleOutputs(plan));
}
