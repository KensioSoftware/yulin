import type {
  SimDynamoDbIndexStatus,
  SimDynamoDbTableStatus,
} from "../command/table/table.types.js";

/**
 * The status an index reports while its table is in a status of its own.
 *
 * A global secondary index has a status of its own, because a table can carry
 * an ACTIVE index and a CREATING one at the same time: UpdateTable adds one to
 * a table that keeps serving the rest. A table being deleted takes all of them
 * with it, so that one case is answered from the table rather than the index.
 */
export function simDynamoDbIndexStatus(
  tableStatus: SimDynamoDbTableStatus,
  indexStatus: SimDynamoDbIndexStatus,
): SimDynamoDbIndexStatus {
  if (tableStatus === "DELETING") {
    return "DELETING";
  }

  return indexStatus;
}
