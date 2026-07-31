import type { SimDynamoDbNumber } from "./sim-dynamodb-number.js";

/**
 * One stored DynamoDB attribute value.
 *
 * The ten descriptors DynamoDB has are ten shapes here, each holding what the
 * request gave rather than a JavaScript stand-in for it: a number keeps its
 * digits, binary keeps its bytes, and a set keeps its members in the order they
 * arrived.
 */
export type SimDynamoDbValue =
  | SimDynamoDbStringValue
  | SimDynamoDbNumberValue
  | SimDynamoDbBinaryValue
  | SimDynamoDbBooleanValue
  | SimDynamoDbNullValue
  | SimDynamoDbStringSetValue
  | SimDynamoDbNumberSetValue
  | SimDynamoDbBinarySetValue
  | SimDynamoDbListValue
  | SimDynamoDbMapValue;

/**
 * A string attribute. An empty one is allowed, except as a key attribute.
 */
export interface SimDynamoDbStringValue {
  readonly kind: "S";
  readonly text: string;
}

/**
 * A number attribute, held as digits rather than as a JavaScript number.
 */
export interface SimDynamoDbNumberValue {
  readonly kind: "N";
  readonly number: SimDynamoDbNumber;
}

/**
 * A binary attribute, held as the bytes it was given.
 */
export interface SimDynamoDbBinaryValue {
  readonly kind: "B";
  readonly bytes: Uint8Array;
}

/**
 * A boolean attribute.
 */
export interface SimDynamoDbBooleanValue {
  readonly kind: "BOOL";
  readonly boolean: boolean;
}

/**
 * A null attribute, which is a value in DynamoDB rather than an absent one.
 */
export interface SimDynamoDbNullValue {
  readonly kind: "NULL";
}

/**
 * A set of strings.
 */
export interface SimDynamoDbStringSetValue {
  readonly kind: "SS";
  readonly texts: readonly string[];
}

/**
 * A set of numbers.
 */
export interface SimDynamoDbNumberSetValue {
  readonly kind: "NS";
  readonly numbers: readonly SimDynamoDbNumber[];
}

/**
 * A set of binary values.
 */
export interface SimDynamoDbBinarySetValue {
  readonly kind: "BS";
  readonly bytes: readonly Uint8Array[];
}

/**
 * A list, which may hold values of different kinds.
 */
export interface SimDynamoDbListValue {
  readonly kind: "L";
  readonly values: readonly SimDynamoDbValue[];
}

/**
 * A map, keyed by attribute name.
 */
export interface SimDynamoDbMapValue {
  readonly kind: "M";
  readonly entries: ReadonlyMap<string, SimDynamoDbValue>;
}
