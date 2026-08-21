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
  TerraformPlannedModule,
  TerraformPlannedResource,
} from "./sim-tf-plan.type.js";
import type { TerraformResource } from "./sim-tf-resource.type.js";
import { terraformExpressionReferences } from "./sim-tf-expression-references.js";
import {
  childModuleCallName,
  childModuleSegment,
  configResourcesByKey,
  providerShortName,
  unknownAttributesByAddress,
} from "./sim-tf-plan-sections.js";

/**
 * Every managed AWS resource a plan will create, in declaration order.
 *
 * The three sections a plan splits a resource across are walked together.
 * `planned_values` and `configuration` are two trees of the same shape, and
 * `configuration` addresses its resources relative to the module declaring
 * them, so the two are joined per module rather than matched on address.
 * `resource_changes` is a flat list keyed by the fully qualified address.
 *
 * Data sources are left out, because a data source reads infrastructure that
 * already exists and creates nothing. Resources from another provider are left
 * in, carrying their provider name, so the caller can report them rather than
 * silently lose them.
 */
export function terraformPlanResources(
  plan: TerraformPlan,
): readonly TerraformResource[] {
  const rootValues = plan.planned_values?.root_module;

  if (rootValues === undefined) {
    return [];
  }

  return collectModule(
    rootValues,
    plan.configuration?.root_module,
    [],
    unknownAttributesByAddress(plan),
  );
}

function collectModule(
  values: TerraformPlannedModule,
  config: TerraformConfigModule | undefined,
  modulePath: readonly string[],
  unknown: ReadonlyMap<string, Record<string, unknown>>,
): readonly TerraformResource[] {
  const declared = configResourcesByKey(config);

  const own = (values.resources ?? [])
    .filter((resource) => (resource.mode ?? "managed") === "managed")
    .map((resource) => joined(resource, declared, modulePath, unknown));

  const nested = (values.child_modules ?? []).flatMap((child) => {
    // The configuration is filed under the call name and the resources are
    // addressed by the instance, so the two parts of the walk take different
    // halves of the same segment.
    const callName = childModuleCallName(child.address, modulePath);

    return collectModule(
      child,
      config?.module_calls?.[callName]?.module,
      [...modulePath, childModuleSegment(child.address, modulePath)],
      unknown,
    );
  });

  return [...own, ...nested];
}

function joined(
  resource: TerraformPlannedResource,
  declared: ReadonlyMap<string, TerraformConfigResource>,
  modulePath: readonly string[],
  unknown: ReadonlyMap<string, Record<string, unknown>>,
): TerraformResource {
  const config = declared.get(`${resource.type}.${resource.name}`);

  return {
    address: resource.address,
    type: resource.type,
    name: resource.name,
    index: resource.index,
    provider: providerShortName(resource.provider_name),
    values: resource.values ?? {},
    unknown: unknown.get(resource.address) ?? {},
    expressions: config?.expressions ?? {},
    dependsOn: config?.depends_on ?? [],
    forEach: terraformExpressionReferences(config?.for_each_expression),
    modulePath,
  };
}
