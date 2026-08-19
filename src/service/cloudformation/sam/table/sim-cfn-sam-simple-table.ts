import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../template/value/sim-cfn-template-value.js";
import {
  samCarriedAttributes,
  samResourceProperties,
} from "../function/sim-cfn-sam-function-properties.js";
import { samPickedProperties } from "../sim-cfn-sam-picked.js";
import { isSamTemplateRecord } from "../sim-cfn-sam-record.js";
import { samSimpleTablePrimaryKey } from "./sim-cfn-sam-simple-table-key.js";

interface SamSimpleTableExpansionProperties {
  readonly logicalId: string;
  readonly resource: SimCfnTemplateValueRecord;
}

/**
 * The SAM Resource type this expansion covers.
 */
export const samSimpleTableType = "AWS::Serverless::SimpleTable";

/**
 * The properties whose names and meanings are the same on both Resource types.
 * Expanding one of them is carrying it across.
 */
const propertyNames = new Set([
  "PointInTimeRecoverySpecification",
  "SSESpecification",
  "TableName",
]);

/**
 * Expand one AWS::Serverless::SimpleTable into the Resource CloudFormation
 * deploys for it.
 *
 * The table keeps the logical ID the template gave the SAM Resource. `Ref`
 * and `Fn::GetAtt` against that name answer what they answer for the table.
 *
 * A simple table has one partition key and no sort key. That is the whole of
 * what makes it simple. The key it names becomes both the key schema and the
 * one attribute definition, and a table naming no key gets the `id` string key
 * SAM gives one. Billing is on demand until the table asks for capacity, the
 * way SAM bills one.
 */
export function samSimpleTableResources(
  properties: SamSimpleTableExpansionProperties,
): Record<string, SimCfnTemplateValue> {
  const { logicalId, resource } = properties;
  const tableProperties = samResourceProperties(resource);
  const primaryKey = samSimpleTablePrimaryKey(tableProperties);

  return {
    [logicalId]: {
      Type: "AWS::DynamoDB::Table",
      ...samCarriedAttributes(resource),
      Properties: {
        ...samPickedProperties(tableProperties, propertyNames),
        AttributeDefinitions: [primaryKey.definition],
        KeySchema: [{ AttributeName: primaryKey.name, KeyType: "HASH" }],
        ...samSimpleTableBilling(tableProperties["ProvisionedThroughput"]),
        ...samSimpleTableTags(tableProperties["Tags"]),
      },
    },
  };
}

/**
 * How the table is billed. A simple table asking for no capacity is billed on
 * demand, and one asking for capacity is billed for the capacity it asked for.
 */
function samSimpleTableBilling(
  throughput: SimCfnTemplateValue | undefined,
): SimCfnTemplateValueRecord {
  return throughput === undefined
    ? { BillingMode: "PAY_PER_REQUEST" }
    : { ProvisionedThroughput: throughput };
}

/**
 * The tags the table carries.
 *
 * SAM states them as a map of one value per tag name. A DynamoDB table takes
 * the list of `Key` and `Value` pairs every taggable Resource takes, and the
 * map is turned into that list here. A template already writing the list keeps
 * it.
 */
function samSimpleTableTags(
  tags: SimCfnTemplateValue | undefined,
): SimCfnTemplateValueRecord {
  if (!isSamTemplateRecord(tags)) {
    return tags === undefined ? {} : { Tags: tags };
  }

  return {
    Tags: Object.entries(tags).map(([name, value]) => ({
      Key: name,
      Value: value,
    })),
  };
}
