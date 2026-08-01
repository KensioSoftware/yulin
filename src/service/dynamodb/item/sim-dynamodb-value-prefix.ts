import type { SimDynamoDbValue } from "./sim-dynamodb-value.js";

/**
 * Whether one stored value starts with another.
 *
 * DynamoDB reads a prefix over strings and over binary, and only against a
 * value of the same type, so a string never begins with binary however the
 * bytes line up. Anything else has no prefix at all, which makes the answer
 * false rather than an error.
 *
 * `begins_with` in a condition expression and `begins_with` in a key condition
 * both ask this, which is why it sits with the item model rather than with
 * either of them.
 */
export function simDynamoDbValueBeginsWith(
  value: SimDynamoDbValue,
  prefix: SimDynamoDbValue,
): boolean {
  if (value.kind === "S" && prefix.kind === "S") {
    return value.text.startsWith(prefix.text);
  }

  if (value.kind === "B" && prefix.kind === "B") {
    return beginsWithBytes(value.bytes, prefix.bytes);
  }

  return false;
}

/**
 * Whether some bytes start with some other bytes.
 */
function beginsWithBytes(bytes: Uint8Array, prefix: Uint8Array): boolean {
  if (prefix.length > bytes.length) {
    return false;
  }

  return prefix.every((byte, at) => bytes.at(at) === byte);
}
