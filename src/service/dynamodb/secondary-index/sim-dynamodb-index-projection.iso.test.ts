import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import type { SimDynamoDbProjectionInput } from "../command/table/table.types.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import { SimDynamoDbIndexProjection } from "./sim-dynamodb-index-projection.js";

/**
 * Read a projection an index would be refused for, and read the refusal.
 */
function refusedProjection(
  input: SimDynamoDbProjectionInput | undefined,
): Error {
  return assertThrowsError(() =>
    SimDynamoDbIndexProjection.fromInput(input, "byStatus"),
  );
}

describe("SimDynamoDbIndexProjection", () => {
  it("requires a projection", () => {
    // When an index is declared with no projection at all.
    const error = refusedProjection(undefined);

    // Then the missing projection is reported, naming the index.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "Index byStatus has no Projection");
  });

  it("requires a projection type", () => {
    // When a projection names no type.
    const error = refusedProjection({ NonKeyAttributes: ["title"] });

    // Then the missing type is reported.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "The Projection of index byStatus has no ProjectionType",
    );
  });

  it("refuses a projection type that is not one of the three", () => {
    // When a projection names a type DynamoDB does not have.
    const error = refusedProjection({ ProjectionType: "SOME" });

    // Then the type is reported with the three it could have been.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "ProjectionType 'SOME'");
    assertStringIncludes(error.message, "ALL, KEYS_ONLY, INCLUDE");
  });

  it("refuses INCLUDE naming no attributes", () => {
    // When a projection includes attributes and names none.
    const error = refusedProjection({
      ProjectionType: "INCLUDE",
      NonKeyAttributes: [],
    });

    // Then it is refused rather than read as KEYS_ONLY written the long way.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "adds nothing to KEYS_ONLY");
  });

  it("refuses INCLUDE with the attributes left out altogether", () => {
    // When a projection is INCLUDE with no NonKeyAttributes property.
    const error = refusedProjection({ ProjectionType: "INCLUDE" });

    // Then the missing attributes are reported.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "adds nothing to KEYS_ONLY");
  });

  it("refuses more than twenty included attributes", () => {
    // When a projection includes twenty one attributes.
    const error = refusedProjection({
      ProjectionType: "INCLUDE",
      NonKeyAttributes: Array.from({ length: 21 }, (_unused, position) =>
        position.toString(),
      ),
    });

    // Then the count is reported.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "names 21 NonKeyAttributes");
  });

  it("refuses attributes named under a projection that adds none", () => {
    // When a KEYS_ONLY projection names attributes to include.
    const error = refusedProjection({
      ProjectionType: "KEYS_ONLY",
      NonKeyAttributes: ["title"],
    });

    // Then the contradiction is reported rather than the attributes dropped.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "names NonKeyAttributes with a ProjectionType of KEYS_ONLY",
    );
  });

  it("takes a projection of the whole item", () => {
    // When an index projects everything.
    const projection = SimDynamoDbIndexProjection.fromInput(
      { ProjectionType: "ALL" },
      "byStatus",
    );

    // Then the type is what it reports, with no attributes to add.
    assertIdentical(projection.type, "ALL");
    assertUndefined(projection.toDescription().NonKeyAttributes);
  });

  it("takes a projection of the keys and named attributes", () => {
    // When an index projects its keys plus two attributes.
    const projection = SimDynamoDbIndexProjection.fromInput(
      { ProjectionType: "INCLUDE", NonKeyAttributes: ["title", "owner"] },
      "byStatus",
    );

    // Then the attributes are reported in the order they were given.
    assertIdentical(projection.toDescription().NonKeyAttributes?.[0], "title");
    assertIdentical(projection.toDescription().NonKeyAttributes?.[1], "owner");
  });
});
