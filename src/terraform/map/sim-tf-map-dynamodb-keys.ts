/*
 * The parts of a table CloudFormation holds as lists of key and index
 * declarations, where Terraform holds them as attributes and repeating blocks.
 *
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import type { SimCfnTemplateValue } from "../../service/cloudformation/template/value/sim-cfn-template-value.js";
import {
  blocks,
  field,
  properties,
  type TerraformMappingContext,
} from "../sim-tf-attributes.js";

/** The attribute types a table declares, one `attribute` block each. */
export function attributeDefinitions(
  context: TerraformMappingContext,
): SimCfnTemplateValue {
  return blocks(context, "attribute").map((entry) => ({
    AttributeName: field(entry, "name") as string,
    AttributeType: field(entry, "type") as string,
  }));
}

/**
 * A key schema, from the hash and range key attribute names.
 *
 * An optional string inside a nested block arrives as an empty string rather
 * than as null, which is how a top-level optional attribute arrives. A range
 * key that was never declared reads as `""`, and taking it at face value
 * declares an index with a nameless RANGE element.
 */
export function keySchema(
  hashKey: unknown,
  rangeKey: unknown,
): SimCfnTemplateValue | undefined {
  if (!named(hashKey)) {
    return undefined;
  }

  const range = named(rangeKey)
    ? [{ AttributeName: rangeKey, KeyType: "RANGE" }]
    : [];

  return [{ AttributeName: hashKey, KeyType: "HASH" }, ...range];
}

function named(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * The global secondary indexes, each provisioned the way the table is.
 *
 * An index of a provisioned table carries a capacity pair of its own, under
 * the same attribute names the table uses, and an index of an on-demand table
 * carries the pair at zero. So the property follows the table's billing mode
 * rather than the presence of the attributes.
 */
export function secondaryIndexes(
  context: TerraformMappingContext,
  provisioned: boolean,
): SimCfnTemplateValue | undefined {
  const indexes = blocks(context, "global_secondary_index");

  if (indexes.length === 0) {
    return undefined;
  }

  return indexes.map((index) => ({
    IndexName: field(index, "name") as string,
    KeySchema:
      keySchema(field(index, "hash_key"), field(index, "range_key")) ?? [],
    Projection: properties({
      ProjectionType: field(index, "projection_type") as string,
      NonKeyAttributes: nonEmptyList(field(index, "non_key_attributes")),
    }),
    ...(provisioned && { ProvisionedThroughput: throughput(index) }),
  }));
}

/**
 * The capacity a provisioned table or index is created with.
 *
 * Simulated DynamoDB requires `ProvisionedThroughput` under `PROVISIONED`
 * billing and refuses it under `PAY_PER_REQUEST`, as real DynamoDB does either
 * way, so a table that leaves it off is refused along with the Stack around it.
 */
export function throughput(
  values: Record<string, unknown>,
): SimCfnTemplateValue {
  return {
    ReadCapacityUnits: field(values, "read_capacity") as number,
    WriteCapacityUnits: field(values, "write_capacity") as number,
  };
}

/** A Terraform list attribute, where the provider left anything in it. */
function nonEmptyList(value: unknown): SimCfnTemplateValue | undefined {
  return Array.isArray(value) && value.length > 0
    ? (value as SimCfnTemplateValue)
    : undefined;
}
