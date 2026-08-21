import { assertNonNullable } from "@kensio/smartass";
import { terraformPlanResources } from "../../../src/terraform/sim-tf-plan-resources.js";
import { TerraformReferenceResolver } from "../../../src/terraform/sim-tf-reference.js";
import type { TerraformMappingContext } from "../../../src/terraform/sim-tf-attributes.js";
import {
  terraformPlanFactory,
  type TerraformPlanFixture,
} from "./terraform-plan.factory.js";

/**
 * A mapping context over the first resource of a plan fixture.
 *
 * A mapping is given one resource and a resolver over the resources the
 * template will declare. Building both from a fixture means a test of a
 * mapping says only what the resource was configured with, and that a
 * reference to another resource of the fixture resolves the way it does in a
 * template built from the whole plan.
 */
export function terraformMappingContext(
  fixture: Partial<TerraformPlanFixture>,
): TerraformMappingContext {
  const resources = terraformPlanResources(terraformPlanFactory.make(fixture));
  const [resource] = resources;

  assertNonNullable(resource);

  return { resource, resolver: new TerraformReferenceResolver(resources) };
}
