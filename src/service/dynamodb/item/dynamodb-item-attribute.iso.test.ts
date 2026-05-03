import { describe, it } from "vitest";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { DynamoDBItemAttribute } from "./dynamodb-item-attribute.js";

describe("DynamoDB Item Attribute", () => {
  it("rejects unrecognised attribute type", () => {
    const error = assertThrowsError(() => {
      // @ts-expect-error testing invalid DDB attribute type key
      DynamoDBItemAttribute.fromAttributeValue({ BAD: "foobar" });
    });

    assertInstanceOf(error, Error);
    assertStringIncludes(error.message, "Unsupported AttributeValue type");
  });
});
