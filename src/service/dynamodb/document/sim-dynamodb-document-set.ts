import type { SimDynamoDbAttributeValue } from "../command/item/item.types.js";
import { SimDynamoDbDocumentValueError } from "../error/dynamodb.error.js";
import { isSimDynamoDbDocumentBinary } from "./sim-dynamodb-document-binary.js";
import type { SimDynamoDbDocumentMarshallOptions } from "./sim-dynamodb-document-marshall-options.js";
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
 * An undefined member is dropped when the client was built with
 * `removeUndefinedValues`, and refused otherwise. DynamoDB has no empty set, so
 * a set with nothing left in it is written as NULL when the client was built
 * with `convertEmptyValues`, and refused otherwise. The two are read in that
 * order, so a set holding nothing but undefined is an empty set by the time its
 * size is looked at, which is where the real conversion looks at it too.
 */
export function simDynamoDbDocumentSetAttribute(
  set: ReadonlySet<unknown>,
  path: string,
  options: SimDynamoDbDocumentMarshallOptions,
): SimDynamoDbAttributeValue {
  const members = [...set].filter(
    (member) => !(member === undefined && options.removeUndefinedValues),
  );

  if (!options.removeUndefinedValues && set.has(undefined)) {
    throw new SimDynamoDbDocumentValueError(
      `${path} is a Set holding undefined. Build the document client with ` +
        `removeUndefinedValues to drop it, which is what the real one asks for`,
    );
  }

  if (members.length === 0) {
    if (options.convertEmptyValues) {
      return { NULL: true };
    }

    throw new SimDynamoDbDocumentValueError(
      `${path} is an empty Set, and DynamoDB has no empty set`,
    );
  }

  return membersAttribute(members, path, options);
}

/**
 * Read the members of a set that is known to hold something.
 */
function membersAttribute(
  members: readonly unknown[],
  path: string,
  options: SimDynamoDbDocumentMarshallOptions,
): SimDynamoDbAttributeValue {
  const first = members[0];

  if (typeof first === "string") {
    return { SS: members.map(String) };
  }

  if (isNumberMember(first)) {
    return {
      NS: members.map((member, index) =>
        numberText(member, path, index, options),
      ),
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
function numberText(
  member: unknown,
  path: string,
  index: number,
  options: SimDynamoDbDocumentMarshallOptions,
): string {
  if (typeof member === "bigint") {
    return member.toString();
  }

  if (isSimDynamoDbDocumentNumberValue(member)) {
    return member.toAttributeValue().N;
  }

  const attribute = simDynamoDbDocumentNumberAttribute(
    Number(member),
    `${path}[${index.toString()}]`,
    options,
  );

  // A number attribute is the only thing that function answers with.
  return attribute.N ?? "";
}
