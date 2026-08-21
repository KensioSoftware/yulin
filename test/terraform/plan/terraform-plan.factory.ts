import { DynamicFactory, MappedFactory } from "@kensio/part-factory";
import type {
  TerraformConfigModule,
  TerraformConfigResource,
  TerraformExpression,
  TerraformPlan,
  TerraformPlannedChildModule,
  TerraformPlannedResource,
  TerraformResourceChange,
} from "../../../src/terraform/sim-tf-plan.type.js";

/**
 * One resource of a plan, said once.
 *
 * A plan splits what it knows about a resource across three sections that a
 * test would otherwise have to keep in step by hand. The resolved values, the
 * attributes that stayed unknown, and the expressions holding what the
 * resource refers to. A fixture says each once and the plan factory puts them
 * where Terraform puts them.
 */
export interface TerraformPlanResourceFixture {
  /** The address inside its own module, such as `aws_sqs_queue.orders`. */
  readonly address: string;
  readonly type: string;
  readonly name: string;
  readonly index: string | number | undefined;
  readonly provider: string;
  /** Attributes the plan resolved. */
  readonly values: Record<string, unknown>;
  /** Attributes the plan could not resolve, as `after_unknown` marks them. */
  readonly unknown: Record<string, unknown>;
  /** What each attribute refers to, keyed by attribute name. */
  readonly references: Record<string, readonly string[]>;
  /** Addresses named by an explicit `depends_on`. */
  readonly dependsOn: readonly string[];
}

/**
 * One module call, its resources, and the outputs the modules above it read.
 */
export interface TerraformPlanModuleFixture {
  readonly name: string;
  readonly resources: readonly TerraformPlanResourceFixture[];
  /** Output name to the references the output's own expression holds. */
  readonly outputs: Record<string, readonly string[]>;
  readonly modules: readonly TerraformPlanModuleFixture[];
}

export interface TerraformPlanFixture {
  readonly resources: readonly TerraformPlanResourceFixture[];
  readonly modules: readonly TerraformPlanModuleFixture[];
}

/**
 * Makes one resource of a plan.
 *
 * The type and the name are the two a test usually cares about, and the
 * address follows from them unless the test says otherwise, which is what a
 * `count` or `for_each` instance does:
 *
 * ```typescript
 * terraformPlanResourceFactory.make({
 *   type: "aws_s3_bucket",
 *   name: "site",
 *   index: "staging",
 *   address: 'aws_s3_bucket.site["staging"]',
 * });
 * ```
 */
export const terraformPlanResourceFactory =
  new DynamicFactory<TerraformPlanResourceFixture>((overrides = {}) => {
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
      references: {},
      dependsOn: [],
    };
  });

/**
 * Makes one module call of a plan.
 */
export const terraformPlanModuleFactory =
  new DynamicFactory<TerraformPlanModuleFixture>(() => ({
    name: "processor",
    resources: [],
    outputs: {},
    modules: [],
  }));

/**
 * Makes the JSON document `terraform show -json` writes for a saved plan.
 *
 * The document holds `planned_values`, `resource_changes` and `configuration`,
 * and the three disagree about how a resource is addressed on purpose.
 * `planned_values` qualifies an address with the module path, and
 * `configuration` files a resource under the module that declares it. A
 * fixture built here is addressed the way Terraform addresses one, so a test
 * of the reader is a test of reading a real plan.
 *
 * ```typescript
 * terraformPlanFactory.make({
 *   resources: [terraformPlanResourceFactory.make({ type: "aws_s3_bucket" })],
 * });
 * ```
 */
export const terraformPlanFactory = new MappedFactory<
  TerraformPlanFixture,
  TerraformPlan
>(
  () => ({ resources: [], modules: [] }),
  (fixture) => ({
    format_version: "1.2",
    terraform_version: "1.15.8",
    planned_values: {
      root_module: {
        resources: fixture.resources.map((resource) =>
          plannedResource(resource, []),
        ),
        child_modules: fixture.modules.map((module) =>
          plannedModule(module, []),
        ),
      },
    },
    resource_changes: changes(fixture),
    configuration: { root_module: configModule(fixture) },
  }),
);

/** Every resource of a plan, whichever module declared it. */
function allResources(
  fixture: TerraformPlanFixture | TerraformPlanModuleFixture,
  modulePath: readonly string[],
): readonly { fixture: TerraformPlanResourceFixture; path: string[] }[] {
  return [
    ...fixture.resources.map((resource) => ({
      fixture: resource,
      path: [...modulePath],
    })),
    ...fixture.modules.flatMap((module) =>
      allResources(module, [...modulePath, module.name]),
    ),
  ];
}

function changes(
  fixture: TerraformPlanFixture,
): readonly TerraformResourceChange[] {
  return allResources(fixture, []).map(({ fixture: resource, path }) => ({
    address: qualified(resource.address, path),
    mode: "managed",
    type: resource.type,
    name: resource.name,
    change: { actions: ["create"], after_unknown: resource.unknown },
  }));
}

function plannedModule(
  module: TerraformPlanModuleFixture,
  modulePath: readonly string[],
): TerraformPlannedChildModule {
  const path = [...modulePath, module.name];

  return {
    address: path.map((name) => `module.${name}`).join("."),
    resources: module.resources.map((resource) =>
      plannedResource(resource, path),
    ),
    child_modules: module.modules.map((child) => plannedModule(child, path)),
  };
}

function plannedResource(
  resource: TerraformPlanResourceFixture,
  modulePath: readonly string[],
): TerraformPlannedResource {
  return {
    address: qualified(resource.address, modulePath),
    mode: "managed",
    type: resource.type,
    name: resource.name,
    index: resource.index,
    provider_name: `registry.terraform.io/${resource.provider}`,
    values: resource.values,
  };
}

function configModule(
  fixture: TerraformPlanFixture | TerraformPlanModuleFixture,
  outputs: Record<string, readonly string[]> = {},
): TerraformConfigModule {
  return {
    resources: fixture.resources.map((resource) => configResource(resource)),
    outputs: Object.fromEntries(
      Object.entries(outputs).map(([name, references]) => [
        name,
        { expression: { references } },
      ]),
    ),
    module_calls: Object.fromEntries(
      fixture.modules.map((module) => [
        module.name,
        { module: configModule(module, module.outputs) },
      ]),
    ),
  };
}

function configResource(
  resource: TerraformPlanResourceFixture,
): TerraformConfigResource {
  return {
    address: `${resource.type}.${resource.name}`,
    mode: "managed",
    type: resource.type,
    name: resource.name,
    expressions: Object.fromEntries(
      Object.entries(resource.references).map(
        ([attribute, references]): [string, TerraformExpression] => [
          attribute,
          { references },
        ],
      ),
    ),
    depends_on: resource.dependsOn,
  };
}

/** One module-relative address as `planned_values` qualifies it. */
function qualified(address: string, modulePath: readonly string[]): string {
  if (modulePath.length === 0) {
    return address;
  }

  return `${modulePath.map((name) => `module.${name}`).join(".")}.${address}`;
}
