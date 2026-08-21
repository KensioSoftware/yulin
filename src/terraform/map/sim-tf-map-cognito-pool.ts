/*
 * The parts of a user pool that need more than a rename: the password policy
 * and the attribute schema, which Terraform states as nested blocks, and the
 * tags, which CloudFormation carries as a map rather than as the list of key
 * and value pairs it uses everywhere else.
 *
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import type { SimCfnTemplateValue } from "../../service/cloudformation/template/value/sim-cfn-template-value.js";
import {
  block,
  blocks,
  field,
  properties,
  templateValue,
  type TerraformMappingContext,
} from "../sim-tf-attributes.js";
import { blockFields } from "../sim-tf-nested-attributes.js";

/**
 * The attributes the pool holds, one Terraform `schema` block each.
 *
 * A custom attribute's constraints are a nested block of their own, and the
 * provider writes both kinds on every entry, so the one that does not belong
 * to the attribute's type is an empty list and comes back undefined.
 */
export function userPoolSchema(
  context: TerraformMappingContext,
): SimCfnTemplateValue | undefined {
  const declared = blocks(context, "schema");

  if (declared.length === 0) {
    return undefined;
  }

  return declared.map((attributeSchema) =>
    properties({
      Name: field(attributeSchema, "name") as string,
      AttributeDataType: field(
        attributeSchema,
        "attribute_data_type",
      ) as string,
      Mutable: field(attributeSchema, "mutable") as boolean,
      Required: field(attributeSchema, "required") as boolean,
      StringAttributeConstraints: constraints(
        attributeSchema,
        "string_attribute_constraints",
        { MinLength: "min_length", MaxLength: "max_length" },
      ),
      NumberAttributeConstraints: constraints(
        attributeSchema,
        "number_attribute_constraints",
        { MinValue: "min_value", MaxValue: "max_value" },
      ),
    }),
  );
}

/** One attribute's constraints, where the block holding them was written. */
function constraints(
  attributeSchema: Record<string, unknown>,
  key: string,
  names: Readonly<Record<string, string>>,
): SimCfnTemplateValue | undefined {
  const declared = field(attributeSchema, key);
  const [first] = Array.isArray(declared) ? (declared as unknown[]) : [];

  if (first === undefined || typeof first !== "object" || first === null) {
    return undefined;
  }

  const bounds = blockFields(first as Record<string, unknown>, names);

  return Object.keys(bounds).length === 0 ? undefined : bounds;
}

/**
 * The pool's tags, which CloudFormation carries as a map rather than as the
 * list of key and value pairs it uses everywhere else.
 *
 * `tags_all` is `tags` merged with the provider's default tags, and it is the
 * one that ends up on the pool.
 */
export function userPoolTags(
  context: TerraformMappingContext,
): SimCfnTemplateValue | undefined {
  const values = context.resource.values;
  const declared = field(values, "tags_all") ?? field(values, "tags");

  return templateValue(declared);
}

/**
 * The pool's password policy, which CloudFormation nests under `Policies`.
 *
 * A policy of nothing but nulls is a pool that stated the block and configured
 * nothing in it, so an empty result is left off rather than sent.
 */
export function userPoolPolicies(
  context: TerraformMappingContext,
): SimCfnTemplateValue | undefined {
  const policy = block(context, "password_policy");

  if (policy === undefined) {
    return undefined;
  }

  const password = blockFields(policy, {
    MinimumLength: "minimum_length",
    RequireUppercase: "require_uppercase",
    RequireLowercase: "require_lowercase",
    RequireNumbers: "require_numbers",
    RequireSymbols: "require_symbols",
    TemporaryPasswordValidityDays: "temporary_password_validity_days",
    PasswordHistorySize: "password_history_size",
  });

  return Object.keys(password).length === 0
    ? undefined
    : { PasswordPolicy: password };
}
