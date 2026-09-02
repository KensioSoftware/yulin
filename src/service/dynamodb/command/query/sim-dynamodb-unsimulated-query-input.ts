import { SimDynamoDbUnsimulatedInput } from "../item/sim-dynamodb-unsimulated-input.js";
import type { SimQueryCommandInput } from "./query.command.js";

/**
 * Refuse the Query inputs this simulation does not model.
 *
 * Each of these changes which items a query answers with, or which parts of
 * them, so a query that quietly ignored one would answer with more than the
 * request asked for. That is the failure that passes here and surprises an
 * application reading the page.
 */
export function refuseUnsimulatedQueryInput(input: SimQueryCommandInput): void {
  const unsimulated = new SimDynamoDbUnsimulatedInput("Query");

  unsimulated.refuse(
    (input.AttributesToGet ?? []).length > 0,
    "AttributesToGet",
    "answering with whole items where part of them was asked for",
  );
  unsimulated.refuseNamed(
    input.KeyConditions,
    "KeyConditions",
    "reading a key condition written the way KeyConditionExpression replaced",
  );
  unsimulated.refuseNamed(
    input.QueryFilter,
    "QueryFilter",
    "answering with the items a legacy filter would have dropped",
  );
  unsimulated.refuse(
    input.ConditionalOperator !== undefined,
    "ConditionalOperator",
    "joining the legacy conditions it applies to",
  );
  unsimulated.refuseReporting(
    input.ReturnConsumedCapacity,
    "ReturnConsumedCapacity",
    "reporting a capacity cost nothing here measures",
  );
}
