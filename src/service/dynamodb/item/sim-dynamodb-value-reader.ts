import type { SimDynamoDbAttributeValue } from "../command/item/item.types.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import { simDynamoDbBinaryCopy } from "./sim-dynamodb-binary.js";
import { SimDynamoDbNumber } from "./sim-dynamodb-number.js";
import { readSimDynamoDbSet } from "./sim-dynamodb-value-set.js";
import type { SimDynamoDbValue } from "./sim-dynamodb-value.js";

/**
 * Real DynamoDB stops at 32 levels of nesting inside one attribute.
 */
const greatestDepth = 32;

/**
 * Refuse a value that is nested deeper than DynamoDB goes.
 */
function assertWithinDepth(depth: number): void {
  if (depth > greatestDepth) {
    throw new SimDynamoDbValidationException(
      `An attribute is nested more than ${greatestDepth.toString()} levels ` +
        `deep, which is as far as DynamoDB goes`,
    );
  }
}

/**
 * Read the one descriptor an AttributeValue is allowed to carry.
 */
function descriptorOf(value: SimDynamoDbAttributeValue): string {
  const descriptors = Object.entries(value)
    .filter(([, carried]) => carried !== undefined)
    .map(([descriptor]) => descriptor);
  const [descriptor] = descriptors;

  if (descriptor === undefined || descriptors.length > 1) {
    throw new SimDynamoDbValidationException(
      "Supplied AttributeValue is empty, must contain exactly one of the " +
        "supported datatypes",
    );
  }

  return descriptor;
}

/**
 * Read a stored attribute value from the AttributeValue a request carries.
 *
 * Everything is checked on the way in rather than on the way out, so a value
 * DynamoDB would refuse never reaches a table, and a value it accepts is held
 * exactly as it was given.
 */
export function readSimDynamoDbValue(
  value: SimDynamoDbAttributeValue,
  depth = 1,
): SimDynamoDbValue {
  assertWithinDepth(depth);

  const descriptor = descriptorOf(value);

  switch (descriptor) {
    case "S": {
      return { kind: "S", text: readText(value.S, "S") };
    }
    case "N": {
      return {
        kind: "N",
        number: SimDynamoDbNumber.of(readText(value.N, "N")),
      };
    }
    case "B": {
      return { kind: "B", bytes: readBytes(value.B) };
    }
    case "BOOL": {
      return { kind: "BOOL", boolean: value.BOOL === true };
    }
    case "NULL": {
      return { kind: "NULL" };
    }
    case "SS":
    case "NS":
    case "BS": {
      return readSimDynamoDbSet(descriptor, value);
    }
    case "L": {
      return readList(value.L ?? [], depth);
    }
    case "M": {
      return readMap(value.M ?? {}, depth);
    }
    default: {
      throw new SimDynamoDbValidationException(
        `Supplied AttributeValue has an unsupported datatype: ${descriptor}`,
      );
    }
  }
}

/**
 * Read the text a string or number descriptor carries.
 */
function readText(value: string | undefined, descriptor: string): string {
  if (typeof value !== "string") {
    throw new SimDynamoDbValidationException(
      `The AttributeValue ${descriptor} must be a string`,
    );
  }

  return value;
}

/**
 * Read the bytes a binary descriptor carries.
 */
function readBytes(value: Uint8Array | undefined): Uint8Array {
  if (!ArrayBuffer.isView(value)) {
    throw new SimDynamoDbValidationException(
      "The AttributeValue B must be binary",
    );
  }

  return simDynamoDbBinaryCopy(value);
}

/**
 * Read a list, one level further down than the value holding it.
 */
function readList(
  values: readonly SimDynamoDbAttributeValue[],
  depth: number,
): SimDynamoDbValue {
  return {
    kind: "L",
    values: values.map((element) => readSimDynamoDbValue(element, depth + 1)),
  };
}

/**
 * Read a map, one level further down than the value holding it.
 */
function readMap(
  entries: Readonly<Record<string, SimDynamoDbAttributeValue>>,
  depth: number,
): SimDynamoDbValue {
  return {
    kind: "M",
    entries: new Map(
      Object.entries(entries).map(([name, element]) => [
        name,
        readSimDynamoDbValue(element, depth + 1),
      ]),
    ),
  };
}
