import { simDynamoDbBinaryText } from "./sim-dynamodb-binary.js";
import type { SimDynamoDbNumber } from "./sim-dynamodb-number.js";
import { compareSimDynamoDbValues } from "./sim-dynamodb-value-order.js";
import type { SimDynamoDbValue } from "./sim-dynamodb-value.js";

/**
 * Whether two stored values are the same value.
 *
 * Every type can be compared for equality, unlike ordering. Two values of
 * different types are never equal, which is what makes `=` between them false
 * rather than an error.
 *
 * A set is equal to another set holding the same members, whatever order they
 * arrived in, because a set has no order. A list is equal only to a list
 * holding the same elements in the same order, because a list does.
 */
export function simDynamoDbValuesEqual(
  first: SimDynamoDbValue,
  second: SimDynamoDbValue,
): boolean {
  if (first.kind !== second.kind) {
    return false;
  }

  return equalOfKind(first, second);
}

/**
 * Whether two values already known to be the same type are the same value.
 */
function equalOfKind(
  first: SimDynamoDbValue,
  second: SimDynamoDbValue,
): boolean {
  switch (first.kind) {
    case "S":
    case "N":
    case "B": {
      return compareSimDynamoDbValues(first, second) === 0;
    }
    case "BOOL": {
      return second.kind === "BOOL" && first.boolean === second.boolean;
    }
    case "NULL": {
      return true;
    }
    case "SS": {
      return second.kind === "SS" && equalMembers(first.texts, second.texts);
    }
    case "NS": {
      return (
        second.kind === "NS" &&
        equalMembers(numberTexts(first.numbers), numberTexts(second.numbers))
      );
    }
    case "BS": {
      return (
        second.kind === "BS" &&
        equalMembers(binaryTexts(first.bytes), binaryTexts(second.bytes))
      );
    }
    case "L": {
      return second.kind === "L" && equalLists(first.values, second.values);
    }
    case "M": {
      return second.kind === "M" && equalMaps(first.entries, second.entries);
    }
  }
}

/**
 * The members of a number set, each as the digits it compares by, so two sets
 * written differently for the same members come out the same.
 */
function numberTexts(numbers: readonly SimDynamoDbNumber[]): readonly string[] {
  return numbers.map((number) => number.text);
}

/**
 * The members of a binary set, each as the base64 it compares by, since two
 * arrays holding the same bytes are different objects.
 */
function binaryTexts(members: readonly Uint8Array[]): readonly string[] {
  return members.map((bytes) => simDynamoDbBinaryText(bytes));
}

/**
 * Whether two sets hold the same members, in whatever order.
 */
function equalMembers(
  first: readonly string[],
  second: readonly string[],
): boolean {
  if (first.length !== second.length) {
    return false;
  }

  const held = new Set(second);

  return first.every((member) => held.has(member));
}

/**
 * Whether two lists hold the same elements in the same order.
 */
function equalLists(
  first: readonly SimDynamoDbValue[],
  second: readonly SimDynamoDbValue[],
): boolean {
  if (first.length !== second.length) {
    return false;
  }

  return first.every((element, at) => {
    const other = second.at(at);

    return other !== undefined && simDynamoDbValuesEqual(element, other);
  });
}

/**
 * Whether two maps hold the same attributes with the same values.
 */
function equalMaps(
  first: ReadonlyMap<string, SimDynamoDbValue>,
  second: ReadonlyMap<string, SimDynamoDbValue>,
): boolean {
  if (first.size !== second.size) {
    return false;
  }

  return first.entries().every(([name, value]) => {
    const other = second.get(name);

    return other !== undefined && simDynamoDbValuesEqual(value, other);
  });
}
