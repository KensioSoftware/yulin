/*
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import { isRecord } from "../../../util/type-guard/record.js";
import type { SimCfnTemplateValue } from "../template/value/sim-cfn-template-value.js";
import type { TerraformResource } from "./sim-tf-plan-resources.js";
import type { TerraformReferenceResolver } from "./sim-tf-reference.js";
import { longestFirst } from "./sim-tf-reference-address.js";
import type { TerraformExpression } from "./sim-tf-plan.type.js";

/**
 * What a mapping function is given to build one CloudFormation Resource.
 */
export interface TerraformMappingContext {
  readonly resource: TerraformResource;
  readonly resolver: TerraformReferenceResolver;
}

/**
 * The value of one Terraform attribute, as CloudFormation would carry it.
 *
 * An attribute the plan resolved returns its value. An attribute still unknown
 * returns the intrinsic that reads it off the Resource producing it, taken from
 * the reference the configuration records for that attribute. An attribute with
 * neither returns undefined.
 */
export function attribute(
  context: TerraformMappingContext,
  key: string,
): SimCfnTemplateValue | undefined {
  const { resource, resolver } = context;

  if (resource.unknown[key] === true) {
    return referencedValue(resource, key, resolver);
  }

  return templateValue(resource.values[key]);
}

/**
 * The intrinsic one unknown attribute reads, from the references its
 * expression records.
 *
 * Terraform lists the attribute form and the bare resource form of the same
 * reference. The attribute form resolves to a `Fn::GetAtt` and is the one
 * wanted, so the first reference that resolves at all wins, and the list is
 * ordered longest first to reach it.
 */
function referencedValue(
  resource: TerraformResource,
  key: string,
  resolver: TerraformReferenceResolver,
): SimCfnTemplateValue | undefined {
  const expression = resource.expressions[key];

  if (!isRecord(expression)) {
    return undefined;
  }

  const references = longestFirst(
    (expression as TerraformExpression).references ?? [],
  );

  for (const reference of references) {
    const resolved = resolver.resolve(reference, resource.modulePath);

    if (resolved !== undefined) {
      return resolved;
    }
  }

  return undefined;
}

/**
 * A Terraform nested block, which the plan represents as a list of records even
 * where the schema allows only one.
 */
export function block(
  context: TerraformMappingContext,
  key: string,
): Record<string, unknown> | undefined {
  const value = context.resource.values[key];

  if (isRecord(value)) {
    return value;
  }

  if (Array.isArray(value) && isRecord(value[0])) {
    return value[0];
  }

  return undefined;
}

/** Every entry of a Terraform nested block that repeats. */
export function blocks(
  context: TerraformMappingContext,
  key: string,
): readonly Record<string, unknown>[] {
  const value = context.resource.values[key];

  return Array.isArray(value) ? value.filter((entry) => isRecord(entry)) : [];
}

/**
 * A CloudFormation `Tags` list built from a Terraform `tags` map.
 *
 * The provider also carries `tags_all`, which is `tags` merged with the
 * provider's default tags. `tags_all` is the one that ends up on the resource.
 */
export function tags(
  context: TerraformMappingContext,
): SimCfnTemplateValue | undefined {
  const value =
    field(context.resource.values, "tags_all") ??
    field(context.resource.values, "tags");

  if (!isRecord(value)) {
    return undefined;
  }

  const entries = Object.entries(value);

  return entries.length === 0
    ? undefined
    : entries.map(([Key, Value]) => ({ Key, Value: Value as string }));
}

/**
 * One key of a Terraform attribute record.
 *
 * Provider attribute names are snake case, which this project's TypeScript
 * settings will not let through a dotted access on an index signature.
 */
export function field(record: Record<string, unknown>, key: string): unknown {
  return record[key];
}

/** A Terraform value, carried as the template value CloudFormation reads. */
export function templateValue(value: unknown): SimCfnTemplateValue | undefined {
  return (value ?? undefined) ? (value as SimCfnTemplateValue) : undefined;
}

/**
 * CloudFormation properties read straight off Terraform attributes.
 *
 * The table is keyed by CloudFormation property name and holds the Terraform
 * attribute each one is read from. Most of a mapping is this, because most
 * properties differ only in what they are called, and the ones that need more
 * than a rename are added to what this returns.
 */
export function renamed(
  context: TerraformMappingContext,
  names: Readonly<Record<string, string>>,
): Record<string, SimCfnTemplateValue> {
  const entries = Object.entries(names).map(
    ([property, name]) => [property, attribute(context, name)] as const,
  );

  return properties(Object.fromEntries(entries));
}

/** A property record with the keys carrying no value taken back out of it. */
export function properties(
  record: Record<string, SimCfnTemplateValue | undefined>,
): Record<string, SimCfnTemplateValue> {
  return Object.fromEntries(
    Object.entries(record).filter(
      (entry): entry is [string, SimCfnTemplateValue] => entry[1] !== undefined,
    ),
  );
}
