import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import type { SimDynamoDbValue } from "../item/sim-dynamodb-value.js";
import {
  simDynamoDbTextSize,
  simDynamoDbValueSize,
} from "../item/sim-dynamodb-value-size.js";

/**
 * The most bytes the placeholders of one request may hold between them, which
 * AWS documents as 2 MB.
 */
const maximumSubstitutionBytes = 2 * 1024 * 1024;

/**
 * Refuse placeholders that come to more than 2 MB between them.
 *
 * Each entry counts its placeholder and what the placeholder stands for. A
 * value counts the bytes it would count towards an item.
 */
export function assertSimDynamoDbSubstitutionSize(
  names: ReadonlyMap<string, string>,
  values: ReadonlyMap<string, SimDynamoDbValue>,
): void {
  const named = names
    .entries()
    .map(([key, name]) => simDynamoDbTextSize(key) + nameSize(key, name));
  const valued = values
    .entries()
    .map(
      ([key, value]) => simDynamoDbTextSize(key) + simDynamoDbValueSize(value),
    );
  const size = [...named, ...valued].reduce((sum, bytes) => sum + bytes, 0);

  if (size > maximumSubstitutionBytes) {
    throw new SimDynamoDbValidationException(
      `ExpressionAttributeNames and ExpressionAttributeValues come to ` +
        `${size.toString()} bytes, and the substitutions of one request ` +
        `are at most 2 MB`,
    );
  }
}

/**
 * The bytes an attribute name a placeholder stands for counts, refusing one
 * that is not a string. A request built without the SDK's types can carry
 * anything there.
 */
function nameSize(key: string, name: unknown): number {
  if (typeof name !== "string") {
    throw new SimDynamoDbValidationException(
      `ExpressionAttributeNames maps ${key} to something other than an ` +
        `attribute name`,
    );
  }

  return simDynamoDbTextSize(name);
}
