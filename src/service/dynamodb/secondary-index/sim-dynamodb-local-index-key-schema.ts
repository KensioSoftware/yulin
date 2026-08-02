import type { SimDynamoDbKeySchemaElementInput } from "../command/table/table.types.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import { SimDynamoDbKeySchema } from "../table/sim-dynamodb-key-schema.js";
import { SimDynamoDbKeySchemaSubject } from "../table/sim-dynamodb-key-schema-subject.js";

/**
 * Refuse a local secondary index on a table with no sort key of its own.
 *
 * The index adds a second sort key to an item collection, and a table keyed by
 * a partition key alone holds one item per collection. There is nothing there
 * to sort, which is why AWS refuses the whole request rather than the index.
 */
export function assertSimDynamoDbTableSortsForLocalIndexes(
  tableKeySchema: SimDynamoDbKeySchema,
): void {
  if (tableKeySchema.rangeKeyAttributeName !== undefined) {
    return;
  }

  throw new SimDynamoDbValidationException(
    "One or more parameter values were invalid: Table KeySchema does not " +
      "have a range key, which is required when specifying a " +
      "LocalSecondaryIndex",
  );
}

/**
 * Read the KeySchema of one local secondary index.
 *
 * The key schema is what makes the index local. Its partition key is the
 * table's own, so an entry sits in the same partition as the item it indexes,
 * and its sort key is some other attribute, so the collection has a second
 * order to be read in. An index sorted by the attribute the table is already
 * sorted by would be the table written twice.
 */
export function readSimDynamoDbLocalIndexKeySchema(
  input: readonly SimDynamoDbKeySchemaElementInput[] | undefined,
  indexName: string,
  tableKeySchema: SimDynamoDbKeySchema,
): SimDynamoDbKeySchema {
  const subject = SimDynamoDbKeySchemaSubject.index(indexName);
  const keySchema = SimDynamoDbKeySchema.fromInput(input, subject);
  const partitionKey = keySchema.hashKeyAttributeName;

  if (partitionKey !== tableKeySchema.hashKeyAttributeName) {
    throw subject.refuse(
      `the HASH element names ${partitionKey}, and a local secondary index ` +
        `shares the table's partition key, which is ${
          tableKeySchema.hashKeyAttributeName
        }`,
    );
  }

  const sortKey = keySchema.rangeKeyAttributeName;

  if (sortKey === undefined) {
    throw subject.refuse(
      "a local secondary index gives an item collection a second sort key, " +
        "and this key schema has no RANGE element",
    );
  }

  if (sortKey === tableKeySchema.rangeKeyAttributeName) {
    throw subject.refuse(
      `the RANGE element names ${sortKey}, which is the table's own sort ` +
        `key, so the index would repeat the order the table is already in`,
    );
  }

  return keySchema;
}
