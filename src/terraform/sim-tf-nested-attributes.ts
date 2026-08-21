/*
 * The two attribute shapes `attribute()` cannot read: a list whose entries name
 * other resources, and an attribute inside a repeating nested block.
 *
 * `after_unknown` mirrors the shape of the value it marks, so a list of ARNs
 * built from one resource is marked `true` whole, and a block whose one field
 * is unknown is marked as a list of records. `configuration` mirrors the same
 * shape with its `references`, and reading the two together is what puts the
 * intrinsic back where the value was.
 *
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import { isRecord } from "../util/type-guard/record.js";
import type { SimCfnTemplateValue } from "../service/cloudformation/template/value/sim-cfn-template-value.js";
import {
  properties,
  templateValue,
  type TerraformMappingContext,
} from "./sim-tf-attributes.js";
import type { TerraformExpression } from "./sim-tf-plan.type.js";
import { longestFirst } from "./sim-tf-reference-address.js";

/**
 * A list attribute whose entries name other resources.
 *
 * An alarm's `alarm_actions` holding one topic ARN of the same plan is marked
 * unknown as a whole list, and the entries are gone with it. What survives is
 * the reference behind each entry, and Terraform lists both the attribute form
 * and the bare resource form of one reference. Both forms of a topic resolve to
 * the same `Ref`, so the resolved values are deduplicated rather than the
 * references, which is the only place the two forms can be told apart.
 *
 * A list the plan resolved is carried across as it stands.
 */
export function attributeList(
  context: TerraformMappingContext,
  key: string,
): SimCfnTemplateValue | undefined {
  const { resource, resolver } = context;

  if (resource.unknown[key] !== true) {
    const value = resource.values[key];

    return Array.isArray(value) ? templateValue(value) : undefined;
  }

  const resolved = new Map<string, SimCfnTemplateValue>();
  const declared = longestFirst(references(resource.expressions[key]));

  for (const reference of declared) {
    const value = resolver.resolve(reference, resource.modulePath);

    if (value !== undefined) {
      resolved.set(JSON.stringify(value), value);
    }
  }

  return resolved.size === 0 ? undefined : resolved.values().toArray();
}

/**
 * One attribute of one entry of a repeating nested block.
 *
 * A bucket notification names the function it calls inside a `lambda_function`
 * block, and the function's ARN is unknown whenever the same plan creates it.
 * The mark and the references both sit at the same position in a list mirroring
 * the block, so the entry's index is what finds them.
 */
export function blockAttribute(
  context: TerraformMappingContext,
  key: string,
  index: number,
  name: string,
): SimCfnTemplateValue | undefined {
  const { resource, resolver } = context;

  if (entry(resource.unknown[key], index)?.[name] !== true) {
    return templateValue(entry(resource.values[key], index)?.[name]);
  }

  const expression = entry(resource.expressions[key], index)?.[name];
  const declared = longestFirst(references(expression));

  for (const reference of declared) {
    const value = resolver.resolve(reference, resource.modulePath);

    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

/**
 * The fields of one nested block, under the names CloudFormation gives them.
 *
 * The provider writes every field of a block that was declared, filling the
 * ones the configuration left out with null, so the table says what each field
 * is called on either side and `properties` takes the nulls back out.
 */
export function blockFields(
  record: Record<string, unknown>,
  names: Readonly<Record<string, string>>,
): Record<string, SimCfnTemplateValue> {
  return properties(
    Object.fromEntries(
      Object.entries(names).map(([property, name]) => [
        property,
        templateValue(record[name]),
      ]),
    ),
  );
}

/** One entry of a list mirroring a repeating block. */
function entry(
  value: unknown,
  index: number,
): Record<string, unknown> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const found: unknown = value[index];

  return isRecord(found) ? found : undefined;
}

/** The references one expression records, or none where it holds no expression. */
function references(expression: unknown): readonly string[] {
  return isRecord(expression)
    ? ((expression as TerraformExpression).references ?? [])
    : [];
}
