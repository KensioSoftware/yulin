import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import type { SimQueryCommandInput } from "./query.command.js";

/**
 * Refuse the parallel scan inputs on a Query.
 *
 * `Segment` and `TotalSegments` divide a Scan. They are not Query parameters at
 * all, and a query has nothing to divide: it reads one item collection, which
 * sits under one partition key and so inside one segment. A request carrying
 * one is code that meant to scan, so it is refused rather than ignored.
 */
export function refuseSimDynamoDbQuerySegment(
  input: SimQueryCommandInput,
): void {
  if (input.Segment === undefined && input.TotalSegments === undefined) {
    return;
  }

  throw new SimDynamoDbValidationException(
    "Segment and TotalSegments divide a parallel Scan, and Query does not " +
      "take them: a query reads one item collection, which sits under one " +
      "partition key",
  );
}
