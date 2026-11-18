import type {
  SimDynamoDbKeySchemaElement,
  SimDynamoDbKeySchemaElementInput,
  SimDynamoDbKeyType,
} from "../command/table/table.types.js";
import type { SimDynamoDbKeySchemaShape } from "./sim-dynamodb-key-schema-shape.js";
import type { SimDynamoDbKeySchemaSubject } from "./sim-dynamodb-key-schema-subject.js";

/**
 * The key type belonging at a position in a key schema.
 *
 * A key schema lists its partition key attributes first and its sort key
 * attributes after them. So the first element is HASH, and any element after a
 * RANGE one is RANGE too. An element after a HASH one may be either, until the
 * key holds as many partition key attributes as its shape allows.
 */
function keyTypesAt(
  previous: readonly SimDynamoDbKeySchemaElement[],
  shape: SimDynamoDbKeySchemaShape,
): readonly SimDynamoDbKeyType[] {
  const last = previous.at(-1);

  if (last === undefined) {
    return ["HASH"];
  }

  if (last.KeyType === "RANGE" || previous.length >= shape.partitionKeys) {
    return ["RANGE"];
  }

  return ["HASH", "RANGE"];
}

/**
 * Read one key schema element, in the position the request put it in.
 *
 * DynamoDB takes the key schema in order: the partition key first, then the
 * sort key when there is one. Position is the whole of it, so an element of the
 * wrong type for where it is gets refused rather than quietly sorted out.
 *
 * A secondary index key schema takes the same shape the table's does, so the
 * subject is what a refusal names rather than the rules being written twice.
 */
export function readSimDynamoDbKeySchemaElement(
  element: SimDynamoDbKeySchemaElementInput,
  previous: readonly SimDynamoDbKeySchemaElement[],
  shape: SimDynamoDbKeySchemaShape,
  subject: SimDynamoDbKeySchemaSubject,
): SimDynamoDbKeySchemaElement {
  const keyTypes = keyTypesAt(previous, shape);
  const keyType = keyTypes.find((candidate) => candidate === element.KeyType);

  if (keyType === undefined) {
    throw subject.refuse(
      `KeySchema element ${(previous.length + 1).toString()} is not a ` +
        `${keyTypes.join(" or ")} key type`,
    );
  }

  if (element.AttributeName === undefined || element.AttributeName === "") {
    throw subject.refuse(`the ${keyType} key element has no AttributeName`);
  }

  if (previous.some((seen) => seen.AttributeName === element.AttributeName)) {
    throw subject.refuse(
      `the attribute ${element.AttributeName} is named by more than one key ` +
        `element`,
    );
  }

  return { AttributeName: element.AttributeName, KeyType: keyType };
}
