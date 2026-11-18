import type {
  SimDynamoDbAttributeValueUpdate,
  SimDynamoDbExpectedAttributeValue,
} from "../../command/item/item.types.js";
import type { SimDynamoDbExpressionParameterInput } from "../sim-dynamodb-expression-parameters.js";
import type { SimDynamoDbLegacyComparison } from "./sim-dynamodb-legacy-comparison.js";

type SimDynamoDbLegacyComparisons =
  | Readonly<Record<string, SimDynamoDbLegacyComparison>>
  | undefined;

/**
 * Every legacy parameter an item command, a query or a scan can carry, with
 * the expressions that replaced them.
 */
export interface SimDynamoDbLegacyInput extends SimDynamoDbExpressionParameterInput {
  readonly AttributesToGet?: readonly string[] | undefined;
  readonly AttributeUpdates?:
    | Readonly<Record<string, SimDynamoDbAttributeValueUpdate>>
    | undefined;
  readonly ConditionalOperator?: string | undefined;
  readonly Expected?:
    | Readonly<Record<string, SimDynamoDbExpectedAttributeValue>>
    | undefined;
  readonly KeyConditions?: SimDynamoDbLegacyComparisons;
  readonly QueryFilter?: SimDynamoDbLegacyComparisons;
  readonly ScanFilter?: SimDynamoDbLegacyComparisons;
  readonly ProjectionExpression?: string | undefined;
  readonly ConditionExpression?: string | undefined;
  readonly UpdateExpression?: string | undefined;
  readonly KeyConditionExpression?: string | undefined;
  readonly FilterExpression?: string | undefined;
}
