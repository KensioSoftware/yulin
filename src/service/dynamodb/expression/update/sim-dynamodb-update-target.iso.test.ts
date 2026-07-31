import {
  assertFalse,
  assertStringIncludes,
  assertThrowsError,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimDynamoDbDocumentPath } from "../sim-dynamodb-document-path.js";
import { SimDynamoDbUpdateTarget } from "./sim-dynamodb-update-target.js";

/**
 * A target for the attributes named, in the order they nest.
 */
function targetFor(...names: readonly string[]): SimDynamoDbUpdateTarget {
  return new SimDynamoDbUpdateTarget(
    new SimDynamoDbDocumentPath(
      names.map((name) => ({ kind: "attribute", name })),
    ),
  );
}

describe("DynamoDB update target", () => {
  it("refuses a document path that names no attribute", () => {
    // Given a document path with no segments, which a parsed path never is.
    const path = new SimDynamoDbDocumentPath([]);

    // When an update action is pointed at it.
    const error = assertThrowsError(() => new SimDynamoDbUpdateTarget(path));

    // Then it is refused rather than pointed at the item itself.
    assertStringIncludes(error.message, "document path attribute");
  });

  it("finds the paths that write over each other", () => {
    // Given targets naming an attribute, something inside it, and a sibling.
    const address = targetFor("address");
    const city = targetFor("address", "city");
    const status = targetFor("status");

    // Then a path containing another overlaps it, whichever way round they are
    // compared, and two that share nothing do not.
    assertTrue(address.overlaps(city));
    assertTrue(city.overlaps(address));
    assertFalse(address.overlaps(status));
  });
});
