import type { SimDynamoDbAttributeValue } from "../command/item/item.types.js";
import { SimDynamoDbDocumentValueError } from "../error/dynamodb.error.js";

/**
 * A value carrying its own Number attribute, which is what lib-dynamodb's
 * `NumberValue` is.
 *
 * It is recognised by the method rather than by its class, since importing the
 * SDK from simulated AWS is not something this package does. That is also what
 * lets a `NumberValue` from a different copy of the SDK work here.
 */
export interface SimDynamoDbDocumentNumberValue {
  toAttributeValue: () => { N: string };
}

/**
 * Whether a value carries its own Number attribute.
 */
export function isSimDynamoDbDocumentNumberValue(
  value: unknown,
): value is SimDynamoDbDocumentNumberValue {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as SimDynamoDbDocumentNumberValue).toAttributeValue ===
      "function"
  );
}

/**
 * Read a JavaScript number as a Number attribute.
 *
 * The document client refuses a number outside the safe integer range rather
 * than storing one that has already lost digits. A simulated table holds the
 * digits it is given exactly, so this refusal is the only thing standing
 * between an application and a silently rounded identifier, which is why it is
 * kept rather than relaxed. A decimal inside the range is written as it stands.
 */
export function simDynamoDbDocumentNumberAttribute(
  value: number,
  path: string,
): SimDynamoDbAttributeValue {
  if (!Number.isFinite(value)) {
    throw new SimDynamoDbDocumentValueError(
      `${path} is ${value.toString()}, and DynamoDB has no such number`,
    );
  }

  if (value > Number.MAX_SAFE_INTEGER || value < Number.MIN_SAFE_INTEGER) {
    throw new SimDynamoDbDocumentValueError(
      `${path} is ${value.toString()}, which is outside the range a ` +
        `JavaScript number holds exactly. Write it as a bigint, or as a ` +
        `NumberValue from @aws-sdk/lib-dynamodb, so its digits survive`,
    );
  }

  return { N: value.toString() };
}

/**
 * Read a Number attribute back as the document client answers with it.
 *
 * A number the safe integer range holds comes back as a JavaScript number. One
 * outside it comes back as a bigint, which is what the real document client
 * does rather than rounding it away. A value that is outside the range and is
 * not whole, such as a decimal carrying more digits than a JavaScript number
 * does, has nothing to come back as and is refused.
 */
export function simDynamoDbDocumentNativeNumber(
  text: string,
  path: string,
): number | bigint {
  const value = Number(text);
  const outsideSafeRange =
    Number.isFinite(value) &&
    (value > Number.MAX_SAFE_INTEGER || value < Number.MIN_SAFE_INTEGER);

  if (!outsideSafeRange) {
    return value;
  }

  try {
    return BigInt(text);
  } catch {
    throw new SimDynamoDbDocumentValueError(
      `${path} holds ${text}, which is outside the range a JavaScript ` +
        `number holds exactly and is not a whole number, so the document ` +
        `client has nothing to answer with`,
    );
  }
}
