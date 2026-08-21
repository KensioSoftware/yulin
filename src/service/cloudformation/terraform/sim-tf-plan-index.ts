/*
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import type {
  TerraformConfigModule,
  TerraformConfigResource,
  TerraformPlan,
} from "./sim-tf-plan.type.js";

export interface TerraformChangeParts {
  readonly unknown: Record<string, unknown>;
}

/**
 * Each resource's `after_unknown`, keyed by the address it belongs to.\n *\n * `planned_values` says what a value is and `resource_changes` says whether\n * the plan knew it, so reading a resource means having both to hand.
 */
export function changesByAddress(
  plan: TerraformPlan,
): ReadonlyMap<string, TerraformChangeParts> {
  const entries = (plan.resource_changes ?? []).map(
    (change): [string, TerraformChangeParts] => [
      change.address,
      { unknown: change.change?.after_unknown ?? {} },
    ],
  );

  return new Map(entries);
}

/**
 * The declared configuration of one module's resources, keyed by type and\n * name.\n *\n * Configuration addresses are relative to the module that declares them, while\n * `planned_values` addresses are fully qualified, so the two are joined per\n * module rather than across the whole plan.
 */
export function configResourcesByKey(
  config: TerraformConfigModule | undefined,
): ReadonlyMap<string, TerraformConfigResource> {
  const entries = (config?.resources ?? []).map(
    (resource): [string, TerraformConfigResource] => [
      `${resource.type}.${resource.name}`,
      resource,
    ],
  );

  return new Map(entries);
}

/**
 * The call name of a child module, taken off its fully qualified address.
 *
 * A child module address repeats its parents, so `module.a.module.b` under
 * `["a"]` is the call named `b`. A module called with `for_each` carries the
 * key on the address, and the key belongs to the instance rather than to the
 * call the configuration is filed under.
 */
export function childModuleCallName(
  address: string | undefined,
  modulePath: readonly string[],
): string {
  const segments = (address ?? "").split(".");
  const own = segments.slice(modulePath.length * 2);
  const called = own[1] ?? "";

  return called.replace(/\[.*]$/, "");
}

/**
 * The provider that owns a resource type, without the registry it came from.
 */
export function providerShortName(providerName: string | undefined): string {
  if (providerName === undefined) {
    return "unknown";
  }

  const [name] = providerName.split("registry.terraform.io/").slice(-1);

  return name ?? providerName;
}
