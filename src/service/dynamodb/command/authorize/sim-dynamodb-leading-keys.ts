import type { SimIamConditions } from "../../../iam/tag/sim-iam-tag-conditions.js";
import type { SimDynamoDbKeyCondition } from "../../expression/key-condition/sim-dynamodb-key-condition.js";
import type { SimDynamoDbItem } from "../../item/sim-dynamodb-item.js";
import type { SimDynamoDbValue } from "../../item/sim-dynamodb-value.js";
import type { SimDynamoDbTable } from "../../table/sim-dynamodb-table.js";

/**
 * The condition key DynamoDB names a request's partition key values by.
 */
export const simDynamoDbLeadingKeysConditionKey = "dynamodb:LeadingKeys";

/**
 * The condition keys AWS names the partition key attributes by, in key schema
 * order. `dynamodb:FirstPartitionKeyValues` holds the same values as
 * `dynamodb:LeadingKeys`. The others hold the second, third and fourth
 * attributes of a multi-attribute partition key, which only a global secondary
 * index has.
 */
const partitionKeyConditionKeys = [
  "dynamodb:FirstPartitionKeyValues",
  "dynamodb:SecondPartitionKeyValues",
  "dynamodb:ThirdPartitionKeyValues",
  "dynamodb:FourthPartitionKeyValues",
] as const;

/**
 * The partition key values one request reaches, one list per partition key
 * attribute in key schema order. A table's own key has one attribute, so a
 * request against it reaches one list.
 */
export type SimDynamoDbPartitionKeyValues = readonly (readonly string[])[];

/**
 * The partition key values one request reaches in one table.
 *
 * Which attribute holds the partition key is the table's to say, so a command
 * hands over how to read the values rather than the values themselves. The
 * table is found before the caller is authorized against it, and the values
 * are read from it in between.
 */
export type SimDynamoDbLeadingKeys = (
  table: SimDynamoDbTable,
) => SimDynamoDbPartitionKeyValues;

/**
 * Write one partition key value the way an IAM policy condition holds it.
 *
 * A policy condition value is a string. A string key is its text and a number
 * key is its digits. Binary has no form documented for the condition key, and
 * a request carrying a binary partition key leaves the value out rather than
 * inventing an encoding for it.
 */
function leadingKeyText(
  value: SimDynamoDbValue | undefined,
): string | undefined {
  if (value?.kind === "S") {
    return value.text;
  }

  if (value?.kind === "N") {
    return value.number.text;
  }

  return undefined;
}

/**
 * Read the partition key values a run of items or keys carries.
 *
 * The items are read when authorization asks for them rather than at the call
 * site, which is what keeps a request DynamoDB would refuse being refused
 * after the caller has been authorized rather than before.
 *
 * An item with no readable partition key value is left out.
 */
export function simDynamoDbLeadingKeysOf(
  items: () => readonly SimDynamoDbItem[],
): SimDynamoDbLeadingKeys {
  return (table): SimDynamoDbPartitionKeyValues => {
    const read = items();

    return table.keySchema.partitionKeyAttributeNames.map((attributeName) =>
      read
        .map((item) => leadingKeyText(item.attribute(attributeName)))
        .filter((text): text is string => text !== undefined),
    );
  };
}

/**
 * Read the partition key values a key condition names, one per attribute.
 *
 * The values are already held against the key schema of what is being read,
 * so the table says nothing more about them here.
 */
export function simDynamoDbKeyConditionLeadingKeys(
  keyCondition: SimDynamoDbKeyCondition,
): SimDynamoDbPartitionKeyValues {
  return keyCondition.partitionKey
    .values()
    .map((value) => {
      const text = leadingKeyText(value);

      return text === undefined ? [] : [text];
    })
    .toArray();
}

/**
 * The condition values the partition key values supply, leaving out a
 * position that reached none.
 */
export function simDynamoDbPartitionKeyConditions(
  values: SimDynamoDbPartitionKeyValues,
): SimIamConditions {
  const keyed = [
    simDynamoDbLeadingKeysConditionKey,
    ...partitionKeyConditionKeys,
  ].map((conditionKey, index) => {
    // LeadingKeys and FirstPartitionKeyValues both name the first position.
    const position = Math.max(index - 1, 0);

    return [conditionKey, values.at(position) ?? []] as const;
  });

  return Object.fromEntries(keyed.filter(([, reached]) => reached.length > 0));
}
