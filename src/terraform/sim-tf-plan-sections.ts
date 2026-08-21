/**
 * How the three sections of a plan document address and key what they hold.
 *
 * Each section says something different about the same resource and none of
 * them says it the same way. `resource_changes` is a flat list keyed by fully
 * qualified address, `configuration` files a resource under the module that
 * declares it, and both a child module address and a provider name carry more
 * than the name being read out of them. This is that reading, kept away from
 * the walk that uses it.
 */
import {
  addressSegments,
  withoutInstanceKeys,
} from "./sim-tf-reference-address.js";
import type {
  TerraformConfigModule,
  TerraformConfigResource,
  TerraformPlan,
} from "./sim-tf-plan.type.js";

/**
 * Each resource's `after_unknown`, keyed by the address it belongs to.
 *
 * `planned_values` says what a value is and `resource_changes` says whether the
 * plan knew it, so reading a resource means having both to hand.
 */
export function unknownAttributesByAddress(
  plan: TerraformPlan,
): ReadonlyMap<string, Record<string, unknown>> {
  return new Map(
    (plan.resource_changes ?? []).map((change) => [
      change.address,
      change.change?.after_unknown ?? {},
    ]),
  );
}

/** The declared configuration of one module's resources, by type and name. */
export function configResourcesByKey(
  config: TerraformConfigModule | undefined,
): ReadonlyMap<string, TerraformConfigResource> {
  return new Map(
    (config?.resources ?? []).map((resource) => [
      `${resource.type}.${resource.name}`,
      resource,
    ]),
  );
}

/**
 * The child module segment of an address, as `planned_values` writes it.
 *
 * A child module address repeats its parents, so `module.a.module.b` under
 * `["a"]` is `b`. A module called with `count` or `for_each` carries the
 * instance key here, and `module.workers["blue"]` gives `workers["blue"]`.
 * That is the form every address under the module is written with, so it is
 * the form a reference from inside it has to be qualified against.
 */
export function childModuleSegment(
  address: string | undefined,
  modulePath: readonly string[],
): string {
  return addressSegments(address ?? "")[modulePath.length * 2 + 1] ?? "";
}

/**
 * The call name of a child module, without any instance key.
 *
 * The configuration files a module under the name it was called by, once,
 * however many instances the call has, so this is the form its `module_calls`
 * are keyed on.
 */
export function childModuleCallName(
  address: string | undefined,
  modulePath: readonly string[],
): string {
  return withoutInstanceKeys(childModuleSegment(address, modulePath));
}

/** The provider that owns a resource type, without the registry it came from. */
export function providerShortName(providerName: string | undefined): string {
  if (providerName === undefined) {
    return "unknown";
  }

  return providerName.replace(/^registry\.terraform\.io\//u, "");
}
