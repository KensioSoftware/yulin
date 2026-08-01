import type { SimDynamoDbAttributeValue } from "../command/item/item.types.js";
import { SimDynamoDbDocumentValueError } from "../error/dynamodb.error.js";
import { isSimDynamoDbDocumentBinary } from "./sim-dynamodb-document-binary.js";
import {
  isSimDynamoDbDocumentNumberValue,
  simDynamoDbDocumentNumberAttribute,
} from "./sim-dynamodb-document-number.js";

/**
 * Read a JavaScript Set as one of DynamoDB's three set attributes.
 *
 * The kind is decided by the first member, as the real document client decides
 * it. A set holding more than one kind is not caught here: the members are all
 * read as the first one's kind, and one that cannot be read that way is refused
 * further down, where the table reads the value. That is what the real one
 * does, so a set written this way behaves the same either side.
 *
 * DynamoDB has no empty set, so an empty one is refused rather than written as
 * something else.
 */
export function simDynamoDbDocumentSetAttribute(
  set: ReadonlySet<unknown>,
  path: string,
): SimDynamoDbAttributeValue {
  if (set.size === 0) {
    throw new SimDynamoDbDocumentValueError(
      `${path} is an empty Set, and DynamoDB has no empty set`,
    );
  }

  if (set.has(undefined)) {
    throw new SimDynamoDbDocumentValueError(
      `${path} is a Set holding undefined. The real document client drops it ` +
        `only when it was built with removeUndefinedValues, which simulated ` +
        `DynamoDB does not read yet`,
    );
  }

  return membersAttribute([...set], path);
}

/**
 * Read the members of a set that is known to hold something.
 */
function membersAttribute(
  members: readonly unknown[],
  path: string,
): SimDynamoDbAttributeValue {
  const first = members[0];

  if (typeof first === "string") {
    return { SS: members.map(String) };
  }

  if (isNumberMember(first)) {
    return {
      NS: members.map((member, index) => numberText(member, path, index)),
    };
  }

  if (isSimDynamoDbDocumentBinary(first)) {
    return { BS: members.map((member) => member as Uint8Array) };
  }

  throw new SimDynamoDbDocumentValueError(
    `${path} is a Set of ${typeof first}, where DynamoDB has string, number ` +
      `and binary sets`,
  );
}

/**
 * Whether a member says the set is a number set.
 *
 * A `NumberValue` counts, since it is how a set of numbers past what a
 * JavaScript number holds is written.
 */
function isNumberMember(member: unknown): boolean {
  return (
    typeof member === "number" ||
    typeof member === "bigint" ||
    isSimDynamoDbDocumentNumberValue(member)
  );
}

/**
 * The digits one member of a number set is written with.
 */
function numberText(member: unknown, path: string, index: number): string {
  if (typeof member === "bigint") {
    return member.toString();
  }

  if (isSimDynamoDbDocumentNumberValue(member)) {
    return member.toAttributeValue().N;
  }

  const attribute = simDynamoDbDocumentNumberAttribute(
    Number(member),
    `${path}[${index.toString()}]`,
  );

  // A number attribute is the only thing that function answers with.
  return attribute.N ?? "";
}
