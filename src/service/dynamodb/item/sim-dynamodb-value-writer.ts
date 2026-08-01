import type { SimDynamoDbAttributeValue } from "../command/item/item.types.js";
import { simDynamoDbBinaryCopy } from "./sim-dynamodb-binary.js";
import type { SimDynamoDbValue } from "./sim-dynamodb-value.js";

/**
 * Write a stored attribute value back as the AttributeValue a caller reads.
 *
 * Nothing is converted on the way out. A number gives back the digits it was
 * stored with, so what a request wrote is what a response carries.
 */
export function writeSimDynamoDbValue(
  value: SimDynamoDbValue,
): SimDynamoDbAttributeValue {
  switch (value.kind) {
    case "S": {
      return { S: value.text };
    }
    case "N": {
      return { N: value.number.text };
    }
    case "B": {
      return { B: simDynamoDbBinaryCopy(value.bytes) };
    }
    case "BOOL": {
      return { BOOL: value.boolean };
    }
    case "NULL": {
      return { NULL: true };
    }
    case "SS": {
      return { SS: [...value.texts] };
    }
    case "NS": {
      return { NS: value.numbers.map((number) => number.text) };
    }
    case "BS": {
      return { BS: value.bytes.map((member) => simDynamoDbBinaryCopy(member)) };
    }
    case "L": {
      return {
        L: value.values.map((element) => writeSimDynamoDbValue(element)),
      };
    }
    case "M": {
      return { M: writeEntries(value.entries) };
    }
  }
}

/**
 * Write the entries of a map back as AttributeValues.
 */
function writeEntries(
  entries: ReadonlyMap<string, SimDynamoDbValue>,
): Record<string, SimDynamoDbAttributeValue> {
  return Object.fromEntries(
    entries
      .entries()
      .map(([name, element]) => [name, writeSimDynamoDbValue(element)]),
  );
}
