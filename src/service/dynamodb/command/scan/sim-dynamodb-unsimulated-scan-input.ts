import { SimDynamoDbUnsimulatedInput } from "../item/sim-dynamodb-unsimulated-input.js";
import type { SimScanCommandInput } from "./scan.command.js";

/**
 * Refuse the Scan inputs this simulation does not model.
 *
 * Each of these changes which items a scan answers with, or which parts of
 * them, so a scan that quietly ignored one would answer with more than the
 * request asked for. That is the failure that passes here and surprises an
 * application reading the page.
 *
 * `ExpressionAttributeNames` and `ExpressionAttributeValues` are not among
 * them. They are the placeholders of the `FilterExpression`, and a request
 * carrying them with no expression to use them in is a ValidationException the
 * way it is on AWS.
 */
export function refuseUnsimulatedScanInput(input: SimScanCommandInput): void {
  const unsimulated = new SimDynamoDbUnsimulatedInput("Scan");

  unsimulated.refuse(
    input.IndexName !== undefined,
    "IndexName",
    "reading the table where a secondary index was asked for",
  );
  unsimulated.refuse(
    input.ProjectionExpression !== undefined,
    "ProjectionExpression",
    "answering with whole items where part of them was asked for",
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
  unsimulated.refuseReporting(
    input.ReturnConsumedCapacity,
    "ReturnConsumedCapacity",
    "reporting a capacity cost nothing here measures",
  );
}
