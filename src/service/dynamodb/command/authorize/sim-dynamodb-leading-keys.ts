import type { SimDynamoDbItem } from "../../item/sim-dynamodb-item.js";
import type { SimDynamoDbValue } from "../../item/sim-dynamodb-value.js";
import type { SimDynamoDbTable } from "../../table/sim-dynamodb-table.js";

/**
 * The condition key DynamoDB names a request's partition key values by.
 */
export const simDynamoDbLeadingKeysConditionKey = "dynamodb:LeadingKeys";

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
) => readonly string[];

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
  return (table): readonly string[] =>
    items()
      .map((item) =>
        leadingKeyText(item.attribute(table.keySchema.hashKeyAttributeName)),
      )
      .filter((text): text is string => text !== undefined);
}

/**
 * Read the one partition key value a key condition names.
 *
 * The value is already held against the key schema of what is being read, so
 * the table says nothing more about it here.
 */
export function simDynamoDbLeadingKeyOf(
  value: SimDynamoDbValue,
): readonly string[] {
  const text = leadingKeyText(value);

  return text === undefined ? [] : [text];
}
