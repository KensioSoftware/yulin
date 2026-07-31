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

/**
 * A target for one element of a list attribute.
 */
function elementTargetFor(
  name: string,
  index: number,
): SimDynamoDbUpdateTarget {
  return new SimDynamoDbUpdateTarget(
    new SimDynamoDbDocumentPath([
      { kind: "attribute", name },
      { kind: "index", index },
    ]),
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

  it("refuses a document path that starts at a list index", () => {
    // Given a document path starting with an index, which a parsed path never
    // does: an item is a map, so every path starts at an attribute of it.
    const path = new SimDynamoDbDocumentPath([{ kind: "index", index: 0 }]);

    // When an update action is pointed at it.
    const error = assertThrowsError(() => new SimDynamoDbUpdateTarget(path));

    // Then it is refused rather than indexing the item itself.
    assertStringIncludes(error.message, "starts at a list index");
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

  it("tells two list elements of one list apart", () => {
    // Given targets naming two elements of the same list.
    const first = elementTargetFor("lines", 0);
    const second = elementTargetFor("lines", 1);

    // Then neither writes over the other, and the further one orders first, so
    // removing both leaves the elements between them where they were.
    assertFalse(first.overlaps(second));
    assertTrue(second.removalOrder > first.removalOrder);
  });
});
