/*
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import type { SimCfnTemplateValue } from "../../service/cloudformation/template/value/sim-cfn-template-value.js";
import {
  block,
  field,
  properties,
  renamed,
  tags,
  type TerraformMappingContext,
} from "../sim-tf-attributes.js";
import type { TerraformMappedResource } from "../sim-tf-mapping.type.js";
import {
  attributeDefinitions,
  keySchema,
  secondaryIndexes,
  throughput,
} from "./sim-tf-map-dynamodb-keys.js";

/** A table, with the key schema rebuilt from its key attribute names. */
export function dynamodbTable(
  context: TerraformMappingContext,
): TerraformMappedResource {
  const values = context.resource.values;
  const ttl = block(context, "ttl");
  const provisioned = field(values, "billing_mode") === "PROVISIONED";

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
        GlobalSecondaryIndexes: secondaryIndexes(context, provisioned),
        ProvisionedThroughput: provisioned ? throughput(values) : undefined,
        TimeToLiveSpecification: timeToLive(ttl),
        Tags: tags(context),
      }),
    },
  };
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
