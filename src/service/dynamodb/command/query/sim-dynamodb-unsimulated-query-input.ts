import { SimDynamoDbUnsimulatedInput } from "../item/sim-dynamodb-unsimulated-input.js";
import type { SimQueryCommandInput } from "./query.command.js";

/**
 * The `Select` a query already behaves as, which asks for whole items.
 *
 * Real DynamoDB defaults to this for a query against a table rather than an
 * index, so a request naming it asks for what this simulation already does.
 */
const simulatedSelect = "ALL_ATTRIBUTES";

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
    input.IndexName !== undefined,
    "IndexName",
    "reading the table where a secondary index was asked for",
  );
  unsimulated.refuse(
    input.FilterExpression !== undefined,
    "FilterExpression",
    "answering with the items a filter would have dropped",
  );
  unsimulated.refuse(
    input.ProjectionExpression !== undefined,
    "ProjectionExpression",
    "answering with whole items where part of them was asked for",
  );
  unsimulated.refuse(
    input.Select !== undefined && input.Select !== simulatedSelect,
    "Select",
    `counting or projecting rather than answering with whole items, which is ` +
      `what ${simulatedSelect} asks for`,
  );
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
