import type {
  SimDynamoDbIndexStatus,
  SimDynamoDbTableStatus,
} from "../command/table/table.types.js";

/**
 * The status an index has while its table is in a status of its own.
 *
 * An index declared on CreateTable is built with the table that carries it, so
 * real DynamoDB reports a CREATING index on the CreateTable response and an
 * ACTIVE one once the table is ACTIVE. Nothing here adds an index to a table
 * later, so the index status follows the table's rather than being tracked
 * apart from it.
 */
export function simDynamoDbIndexStatus(
  tableStatus: SimDynamoDbTableStatus,
): SimDynamoDbIndexStatus {
  if (tableStatus === "CREATING") {
    return "CREATING";
  }

  if (tableStatus === "DELETING") {
    return "DELETING";
  }

  return "ACTIVE";
}
