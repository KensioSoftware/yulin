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
  /**
   * What each attribute refers to, keyed by attribute name.
   *
   * An attribute inside a repeating nested block is given as a list of
   * records, one entry per block, which is the shape `configuration` mirrors
   * the block with.
   */
  readonly references: Record<
    string,
    readonly string[] | readonly Record<string, readonly string[]>[]
  >;
  /** Addresses named by an explicit `depends_on`. */
  readonly dependsOn: readonly string[];
  /**
   * What `for_each` iterates, as the references its expression holds.
   *
   * A plan carries the instances rather than the collection, so this is the
   * only place it says what `each.value` and `each.key` were reading.
   */
  readonly forEach: readonly string[];
}

/**
 * One module call, its resources, and the outputs the modules above it read.
 */
export interface TerraformPlanModuleFixture {
  readonly name: string;
  /** The `count` or `for_each` key, for one instance of an expanded call. */
  readonly index: string | number | undefined;
  readonly resources: readonly TerraformPlanResourceFixture[];
  /** Output name to the references the output's own expression holds. */
  readonly outputs: Record<string, readonly string[]>;
  /** Variable name to the references the caller set it from. */
  readonly variables: Record<string, readonly string[]>;
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
      forEach: [],
    };
  });

/**
 * Makes one module call of a plan.
 */
export const terraformPlanModuleFactory =
  new DynamicFactory<TerraformPlanModuleFixture>(() => ({
    name: "processor",
    index: undefined,
    resources: [],
    outputs: {},
    variables: {},
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
      allResources(module, [...modulePath, moduleInstance(module)]),
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
  const path = [...modulePath, moduleInstance(module)];

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
        {
          module: configModule(module, module.outputs),
          expressions: Object.fromEntries(
            Object.entries(module.variables).map(([name, references]) => [
              name,
              { references },
            ]),
          ),
        },
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
      Object.entries(resource.references).map(([attribute, references]) => [
        attribute,
        referenceExpression(references),
      ]),
    ),
    depends_on: resource.dependsOn,
    for_each_expression:
      resource.forEach.length === 0
        ? undefined
        : { references: resource.forEach },
  };
}

/**
 * The expression one attribute's references become.
 *
 * A nested block's references sit at the same position in a list as the block
 * they were written in, so a fixture giving a list of records makes a list of
 * expression records rather than one expression.
 */
function referenceExpression(
  references: readonly string[] | readonly Record<string, readonly string[]>[],
): TerraformExpression | readonly Record<string, TerraformExpression>[] {
  if (references.every((entry) => typeof entry === "string")) {
    return { references };
  }

  return (references as readonly Record<string, readonly string[]>[]).map(
    (entry) =>
      Object.fromEntries(
        Object.entries(entry).map(([name, nested]) => [
          name,
          { references: nested },
        ]),
      ),
  );
}

/**
 * One module call as `planned_values` addresses it.
 *
 * A call with `count` or `for_each` is addressed once per instance, and the
 * key is part of the address every resource under it carries.
 */
function moduleInstance(module: TerraformPlanModuleFixture): string {
  if (module.index === undefined) {
    return module.name;
  }

  return typeof module.index === "number"
    ? `${module.name}[${module.index}]`
    : `${module.name}["${module.index}"]`;
}

/** One module-relative address as `planned_values` qualifies it. */
function qualified(address: string, modulePath: readonly string[]): string {
  if (modulePath.length === 0) {
    return address;
  }

  return `${modulePath.map((name) => `module.${name}`).join(".")}.${address}`;
}
