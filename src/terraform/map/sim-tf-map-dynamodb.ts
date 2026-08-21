/*
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
  renamed,
  tags,
  type TerraformMappingContext,
} from "../sim-tf-attributes.js";
import type { TerraformMappedResource } from "../sim-tf-mapping.type.js";

/** A table, with the key schema rebuilt from its key attribute names. */
export function dynamodbTable(
  context: TerraformMappingContext,
): TerraformMappedResource {
  const values = context.resource.values;
  const ttl = block(context, "ttl");

  return {
    Type: "AWS::DynamoDB::Table",
    Properties: {
      ...renamed(context, { TableName: "name", BillingMode: "billing_mode" }),
      ...properties({
        AttributeDefinitions: attributeDefinitions(context),
        KeySchema: keySchema(
          field(values, "hash_key"),
          field(values, "range_key"),
        ),
        GlobalSecondaryIndexes: secondaryIndexes(context),
        TimeToLiveSpecification: timeToLive(ttl),
        Tags: tags(context),
      }),
    },
  };
}

function attributeDefinitions(
  context: TerraformMappingContext,
): SimCfnTemplateValue {
  return blocks(context, "attribute").map((entry) => ({
    AttributeName: field(entry, "name") as string,
    AttributeType: field(entry, "type") as string,
  }));
}

function timeToLive(
  ttl: Record<string, unknown> | undefined,
): SimCfnTemplateValue | undefined {
  return ttl === undefined
    ? undefined
    : {
        AttributeName: field(ttl, "attribute_name") as string,
        Enabled: field(ttl, "enabled") === true,
      };
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

function secondaryIndexes(
  context: TerraformMappingContext,
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
  }));
}

/** A Terraform list attribute, where the provider left anything in it. */
function nonEmptyList(value: unknown): SimCfnTemplateValue | undefined {
  return Array.isArray(value) && value.length > 0
    ? (value as SimCfnTemplateValue)
    : undefined;
}
