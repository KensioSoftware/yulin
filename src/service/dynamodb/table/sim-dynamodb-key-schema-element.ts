import type {
  SimDynamoDbKeySchemaElement,
  SimDynamoDbKeySchemaElementInput,
  SimDynamoDbKeyType,
} from "../command/table/table.types.js";
import type { SimDynamoDbKeySchemaSubject } from "./sim-dynamodb-key-schema-subject.js";

/**
 * The key type belonging at a position in a key schema.
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
 *
 * A secondary index key schema takes the same shape the table's does, so the
 * subject is what a refusal names rather than the rules being written twice.
 */
export function readSimDynamoDbKeySchemaElement(
  element: SimDynamoDbKeySchemaElementInput,
  index: number,
  subject: SimDynamoDbKeySchemaSubject,
): SimDynamoDbKeySchemaElement {
  const expectedKeyType = keyTypeAt(index);

  if (element.KeyType !== expectedKeyType) {
    throw subject.refuse(
      `KeySchema element ${(index + 1).toString()} is not a ` +
        `${expectedKeyType} key type`,
    );
  }

  if (element.AttributeName === undefined || element.AttributeName === "") {
    throw subject.refuse(
      `the ${expectedKeyType} key element has no AttributeName`,
    );
  }

  return { AttributeName: element.AttributeName, KeyType: expectedKeyType };
}
