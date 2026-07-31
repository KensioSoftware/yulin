import type {
  SimDynamoDbKeySchemaElement,
  SimDynamoDbKeySchemaElementInput,
  SimDynamoDbKeyType,
} from "../command/table/table.types.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";

/**
 * The key type belonging at a position in a table key schema.
 */
function keyTypeAt(index: number): SimDynamoDbKeyType {
  if (index === 0) {
    return "HASH";
  }

  return "RANGE";
}

/**
 * Read one key schema element, in the position the request put it in.
 *
 * DynamoDB takes the key schema in order: a partition key first, then a sort
 * key when there is one. Position is the whole of it, so an element of the
 * wrong type for where it is gets refused rather than quietly sorted out.
 */
export function readSimDynamoDbKeySchemaElement(
  element: SimDynamoDbKeySchemaElementInput,
  index: number,
): SimDynamoDbKeySchemaElement {
  const expectedKeyType = keyTypeAt(index);

  if (element.KeyType !== expectedKeyType) {
    throw new SimDynamoDbValidationException(
      `Invalid KeySchema: KeySchema element ${(index + 1).toString()} is not ` +
        `a ${expectedKeyType} key type`,
    );
  }

  if (element.AttributeName === undefined || element.AttributeName === "") {
    throw new SimDynamoDbValidationException(
      `Invalid KeySchema: the ${expectedKeyType} key element has no ` +
        `AttributeName`,
    );
  }

  return { AttributeName: element.AttributeName, KeyType: expectedKeyType };
}
