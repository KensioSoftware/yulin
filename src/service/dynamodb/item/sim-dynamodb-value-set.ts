import type { SimDynamoDbAttributeValue } from "../command/item/item.types.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import {
  simDynamoDbBinaryCopy,
  simDynamoDbBinaryText,
} from "./sim-dynamodb-binary.js";
import { SimDynamoDbNumber } from "./sim-dynamodb-number.js";
import type { SimDynamoDbValue } from "./sim-dynamodb-value.js";

/**
 * Refuse a set real DynamoDB would refuse.
 *
 * A set holds one kind of value, holds at least one, and holds each value once.
 * Membership goes by value: two binary members holding the same bytes are the
 * same member however they were built.
 */
function assertSet(
  descriptor: string,
  members: readonly unknown[],
  keys: readonly string[],
): void {
  if (members.length === 0) {
    throw new SimDynamoDbValidationException(
      `One or more parameter values were invalid: An ${descriptor} set may ` +
        `not be empty`,
    );
  }

  if (new Set(keys).size !== keys.length) {
    throw new SimDynamoDbValidationException(
      `One or more parameter values were invalid: Input collection ` +
        `[${keys.join(", ")}] contains duplicates`,
    );
  }
}

/**
 * Read the members a set descriptor carries.
 */
function membersOf(
  descriptor: string,
  value: SimDynamoDbAttributeValue,
): readonly unknown[] {
  const members = value.SS ?? value.NS ?? value.BS;

  if (!Array.isArray(members)) {
    throw new SimDynamoDbValidationException(
      `The AttributeValue ${descriptor} must be a list of set members`,
    );
  }

  return members;
}

/**
 * Read a string set, refusing a member that is not a string.
 */
function readStringSet(members: readonly unknown[]): SimDynamoDbValue {
  const texts = members.map((member) => {
    if (typeof member !== "string") {
      throw new SimDynamoDbValidationException(
        "One or more parameter values were invalid: An SS set holds strings",
      );
    }

    return member;
  });

  assertSet("SS", members, texts);

  return { kind: "SS", texts };
}

/**
 * Read a number set, refusing a member that is not a number.
 */
function readNumberSet(members: readonly unknown[]): SimDynamoDbValue {
  const numbers = members.map((member) => {
    if (typeof member !== "string") {
      throw new SimDynamoDbValidationException(
        "One or more parameter values were invalid: An NS set holds numbers " +
          "written as strings",
      );
    }

    return SimDynamoDbNumber.of(member);
  });

  assertSet(
    "NS",
    members,
    numbers.map((number) => number.text),
  );

  return { kind: "NS", numbers };
}

/**
 * Read a binary set, comparing members by their bytes.
 */
function readBinarySet(members: readonly unknown[]): SimDynamoDbValue {
  const bytes = members.map((member) => {
    if (!ArrayBuffer.isView(member)) {
      throw new SimDynamoDbValidationException(
        "One or more parameter values were invalid: A BS set holds binary " +
          "values",
      );
    }

    return simDynamoDbBinaryCopy(member as Uint8Array);
  });

  assertSet(
    "BS",
    members,
    bytes.map((member) => simDynamoDbBinaryText(member)),
  );

  return { kind: "BS", bytes };
}

/**
 * Read a set of strings, numbers or binary values.
 */
export function readSimDynamoDbSet(
  descriptor: "SS" | "NS" | "BS",
  value: SimDynamoDbAttributeValue,
): SimDynamoDbValue {
  const members = membersOf(descriptor, value);

  if (descriptor === "SS") {
    return readStringSet(members);
  }

  if (descriptor === "NS") {
    return readNumberSet(members);
  }

  return readBinarySet(members);
}
