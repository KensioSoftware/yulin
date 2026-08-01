import {
  assertArrayEquals,
  assertIdentical,
  assertObjectEquals,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  simDynamoDbDocumentEach,
  simDynamoDbDocumentFields,
  simDynamoDbDocumentValues,
} from "./sim-dynamodb-document-path.js";

/**
 * A conversion that marks what it was given with where it sat, so a test can
 * see where a path reached and where it did not.
 */
const marked = (value: unknown, path: string): unknown =>
  `${String(value)}@${path}`;

describe("simulated DynamoDB document paths", () => {
  it("converts every member of a record", () => {
    // Given a path to a record of values, such as an Item.
    const path = simDynamoDbDocumentValues();

    // When a record is converted.
    const converted = path.convert({ id: "a", total: 1 }, marked, "Item");

    // Then every member went through the conversion, named by where it sat.
    assertObjectEquals(converted, {
      id: "a@Item.id",
      total: "1@Item.total",
    });
  });

  it("converts every member of a list", () => {
    // Given a path to a list of values.
    const path = simDynamoDbDocumentValues();

    // When a list is converted.
    const converted = path.convert(["a", "b"], marked, "Keys") as string[];

    // Then every member went through it, indexed by position.
    assertArrayEquals(converted, ["a@Keys[0]", "b@Keys[1]"]);
  });

  it("leaves the fields it does not name alone", () => {
    // Given a path naming one field of a request.
    const path = simDynamoDbDocumentFields({
      Key: simDynamoDbDocumentValues(),
    });

    // When a request carrying other fields is converted.
    const converted = path.convert(
      { TableName: "T", ConsistentRead: true, Key: { id: "a" } },
      marked,
      "input",
    );

    // Then the other fields are carried through as they were.
    assertObjectEquals(converted, {
      TableName: "T",
      ConsistentRead: true,
      Key: { id: "a@input.Key.id" },
    });
  });

  it("leaves out a field the request left out", () => {
    // Given a path naming a field the request does not carry.
    const path = simDynamoDbDocumentFields({
      ExpressionAttributeValues: simDynamoDbDocumentValues(),
    });

    // When the request is converted.
    const converted = path.convert({ TableName: "T" }, marked, "input");

    // Then it is not added as an empty one, so the operation sees the request
    // it was given.
    assertObjectEquals(converted, { TableName: "T" });
  });

  it("carries a value that is not a record or a list through untouched", () => {
    // Given paths that expect containers.
    const each = simDynamoDbDocumentEach(simDynamoDbDocumentValues());
    const fields = simDynamoDbDocumentFields({
      Key: simDynamoDbDocumentValues(),
    });

    // When something that is neither is converted, which is what a request
    // written the wrong way round carries.
    // Then it is passed on as it stands, so the operation is what refuses it,
    // in its own words, rather than the conversion failing first.
    assertIdentical(
      each.convert("not a record", marked, "input"),
      "not a record",
    );
    assertIdentical(fields.convert(42, marked, "input"), 42);
  });
});
