import type { SimDynamoDbAttributeValue } from "../command/item/item.types.js";
import { SimDynamoDbDocumentValueError } from "../error/dynamodb.error.js";
import { isSimDynamoDbDocumentBinary } from "./sim-dynamodb-document-binary.js";
import { simDynamoDbDocumentNumberAttribute } from "./sim-dynamodb-document-number.js";

/**
 * Read a JavaScript Set as one of DynamoDB's three set attributes.
 *
 * The kind is decided by the first member, as the real document client decides
 * it. A set holding more than one kind is not caught here: the members are all
 * read as the first one's kind, and a member that cannot be read that way is
 * refused further down, where the table reads the value.
 *
 * DynamoDB has no empty set, so an empty one is refused rather than written as
 * something else.
 */
export function simDynamoDbDocumentSetAttribute(
  set: ReadonlySet<unknown>,
  path: string,
): SimDynamoDbAttributeValue {
  const members = [...set];
  const first = members[0];

  if (first === undefined) {
    throw new SimDynamoDbDocumentValueError(
      `${path} is an empty Set, and DynamoDB has no empty set`,
    );
  }

  if (typeof first === "string") {
    return { SS: members.map(String) };
  }

  if (typeof first === "number" || typeof first === "bigint") {
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
 * The digits one member of a number set is written with.
 */
function numberText(member: unknown, path: string, index: number): string {
  if (typeof member === "bigint") {
    return member.toString();
  }

  const attribute = simDynamoDbDocumentNumberAttribute(
    Number(member),
    `${path}[${index.toString()}]`,
  );

  // A number attribute is the only thing that function answers with.
  return attribute.N ?? "";
}
