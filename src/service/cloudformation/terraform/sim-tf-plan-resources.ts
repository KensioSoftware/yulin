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
import {
  changesByAddress,
  childModuleCallName,
  configResourcesByKey,
  providerShortName,
  type TerraformChangeParts,
} from "./sim-tf-plan-index.js";

/**
 * One resource of a plan, with everything the import needs about it in one
 * place.
 *
 * A plan splits what it knows about a resource across three sections.
 * `planned_values` holds resolved attributes, `resource_changes` marks the
 * attributes that stayed unknown, and `configuration` holds what the resource
 * refers to. This is the three joined up.
 */
export interface TerraformResource {
  /** The fully qualified address, such as `module.uploads.aws_s3_bucket.this`. */
  readonly address: string;
  readonly type: string;
  readonly name: string;
  readonly index: string | number | undefined;
  /** The provider that owns the type, such as `hashicorp/aws`. */
  readonly provider: string;
  /** Attributes the plan resolved to a value. */
  readonly values: Record<string, unknown>;
  /** `after_unknown`, whose `true` leaves mark attributes still to be decided. */
  readonly unknown: Record<string, unknown>;
  /** Declared expressions, holding the `references` this resource reads. */
  readonly expressions: Record<string, unknown>;
  /** Explicit `depends_on` addresses, relative to the declaring module. */
  readonly dependsOn: readonly string[];
  /** The module call path this resource was declared under. */
  readonly modulePath: readonly string[];
}

/**
 * Every managed AWS resource a plan will create, in declaration order.
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
    changesByAddress(plan),
  );
}

function collectModule(
  values: TerraformPlannedModule,
  config: TerraformConfigModule | undefined,
  modulePath: readonly string[],
  changes: ReadonlyMap<string, TerraformChangeParts>,
): readonly TerraformResource[] {
  const configResources = configResourcesByKey(config);

  const own = (values.resources ?? [])
    .filter((resource) => (resource.mode ?? "managed") === "managed")
    .map((resource) =>
      joinedResource(resource, configResources, modulePath, changes),
    );

  const nested = (values.child_modules ?? []).flatMap((child) => {
    const callName = childModuleCallName(child.address, modulePath);

    return collectModule(
      child,
      config?.module_calls?.[callName]?.module,
      [...modulePath, callName],
      changes,
    );
  });

  return [...own, ...nested];
}

function joinedResource(
  resource: TerraformPlannedResource,
  configResources: ReadonlyMap<string, TerraformConfigResource>,
  modulePath: readonly string[],
  changes: ReadonlyMap<string, TerraformChangeParts>,
): TerraformResource {
  const config = configResources.get(`${resource.type}.${resource.name}`);
  const change = changes.get(resource.address);

  return {
    address: resource.address,
    type: resource.type,
    name: resource.name,
    index: resource.index,
    provider: providerShortName(resource.provider_name),
    values: resource.values ?? {},
    unknown: change?.unknown ?? {},
    expressions: config?.expressions ?? {},
    dependsOn: config?.depends_on ?? [],
    modulePath,
  };
}
