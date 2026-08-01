import { SimDynamoDbUnsimulatedInput } from "../item/sim-dynamodb-unsimulated-input.js";
import type { SimScanCommandInput } from "./scan.command.js";

/**
 * The `Select` a scan already behaves as, which asks for whole items.
 *
 * Real DynamoDB defaults to this for a scan of a table rather than an index, so
 * a request naming it asks for what this simulation already does.
 */
const simulatedSelect = "ALL_ATTRIBUTES";

/**
 * Refuse the Scan inputs this simulation does not model.
 *
 * Each of these changes which items a scan answers with, or which parts of
 * them, so a scan that quietly ignored one would answer with more than the
 * request asked for. That is the failure that passes here and surprises an
 * application reading the page.
 *
 * `ExpressionAttributeNames` and `ExpressionAttributeValues` are the
 * placeholders of an expression, and every expression a scan can carry is
 * refused above, so a request naming them is asking for one of those. Real
 * DynamoDB calls that a ValidationException rather than an unsupported
 * operation. The refusal is the same either way, and naming what is missing is
 * more use than matching the error class.
 */
export function refuseUnsimulatedScanInput(input: SimScanCommandInput): void {
  const unsimulated = new SimDynamoDbUnsimulatedInput("Scan");

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
    input.ScanFilter,
    "ScanFilter",
    "answering with the items a legacy filter would have dropped",
  );
  unsimulated.refuse(
    input.ConditionalOperator !== undefined,
    "ConditionalOperator",
    "joining the legacy conditions it applies to",
  );
  unsimulated.refuseNamed(
    input.ExpressionAttributeNames,
    "ExpressionAttributeNames",
    "reading placeholders for an expression Scan does not take",
  );
  unsimulated.refuseNamed(
    input.ExpressionAttributeValues,
    "ExpressionAttributeValues",
    "reading placeholders for an expression Scan does not take",
  );
  unsimulated.refuseReporting(
    input.ReturnConsumedCapacity,
    "ReturnConsumedCapacity",
    "reporting a capacity cost nothing here measures",
  );
}
