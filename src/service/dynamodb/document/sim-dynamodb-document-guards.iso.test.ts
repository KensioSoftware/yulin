import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimDynamoDbDocumentValueError } from "../error/dynamodb.error.js";
import { simDynamoDbDocumentSetAttribute } from "./sim-dynamodb-document-set.js";
import { simDynamoDbDocumentNativeValue } from "./sim-dynamodb-document-unmarshall.js";

/**
 * The two refusals a request cannot reach through a document Command, tested
 * where they are rather than through the client.
 *
 * A Set holding undefined is refused before the members are read, and neither
 * the SDK's own types nor a simulated table produce the values that get there,
 * so the conversion is called directly.
 */
describe("simulated DynamoDB document conversion guards", () => {
  it("refuses a Set holding undefined", () => {
    // When a Set carrying an undefined member is converted.
    const error = assertThrowsError(() =>
      simDynamoDbDocumentSetAttribute(new Set([undefined]), "input.Item.tags"),
    );

    // Then it is refused as an undefined value rather than as an empty set,
    // which is the set it would otherwise look like.
    assertInstanceOf(error, SimDynamoDbDocumentValueError);
    assertStringIncludes(error.message, "Set holding undefined");
    assertStringIncludes(error.message, "removeUndefinedValues");
  });

  it("refuses an AttributeValue carrying no type it knows", () => {
    // When something with no descriptor at all is read back.
    const error = assertThrowsError(() =>
      simDynamoDbDocumentNativeValue({} as never, "output.Item.value"),
    );

    // Then it is refused, naming where it sat. Nothing a simulated table holds
    // reaches this, so it stands for the simulator itself going wrong rather
    // than for anything a request did.
    assertInstanceOf(error, SimDynamoDbDocumentValueError);
    assertStringIncludes(error.message, "output.Item.value");
    assertStringIncludes(error.message, "no attribute type");
  });
});
