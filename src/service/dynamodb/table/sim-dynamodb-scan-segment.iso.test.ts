import {
  assertArrayEmpty,
  assertArrayIncludes,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertStringStartsWith,
  assertThrowsError,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import { SimDynamoDbScanSegment } from "./sim-dynamodb-scan-segment.js";

/**
 * A run of marshalled partition key values, as an item key makes them.
 */
function partitionKeys(count: number): readonly string[] {
  return Array.from({ length: count }, (_, index) => `S:c-${index.toString()}`);
}

/**
 * The segments of a division, as a caller of a parallel scan makes them.
 */
function segments(totalSegments: number): readonly SimDynamoDbScanSegment[] {
  return Array.from(
    { length: totalSegments },
    (_, index) => new SimDynamoDbScanSegment({ index, totalSegments }),
  );
}

describe("SimDynamoDbScanSegment", () => {
  it("holds every partition key in one segment of a division", () => {
    // Given a table divided into four segments.
    const division = segments(4);

    // When each partition key value is offered to every segment.
    const holders = partitionKeys(50).map(
      (partitionKey) =>
        division.filter((segment) => segment.holds(partitionKey)).length,
    );

    // Then exactly one segment holds it, so the segments together cover the
    // whole table and none of them overlap.
    assertArrayEmpty(holders.filter((count) => count !== 1));
  });

  it("holds one partition key in the same segment every time", () => {
    // Given one segment of a division.
    const segment = new SimDynamoDbScanSegment({ index: 2, totalSegments: 7 });

    // When the same partition key value is offered to it twice.
    const first = segment.holds("S:c-1");
    const second = segment.holds("S:c-1");

    // Then it answers the same way, since the segment follows from the
    // partition key rather than from when it was asked.
    assertIdentical(second, first);
  });

  it("holds everything in a whole table segment", () => {
    // Given the segment a sequential scan reads.
    const segment = SimDynamoDbScanSegment.whole();

    // When partition key values are offered to it.
    const held = partitionKeys(20).every((partitionKey) =>
      segment.holds(partitionKey),
    );

    // Then it holds all of them, since one segment out of one is the table.
    assertTrue(held);
    assertIdentical(segment.index, 0);
    assertIdentical(segment.totalSegments, 1);
  });

  it("leaves a partition key out of the segments that do not hold it", () => {
    // Given a division into two segments.
    const [first, second] = segments(2);
    assertInstanceOf(first, SimDynamoDbScanSegment);
    assertInstanceOf(second, SimDynamoDbScanSegment);

    // When a partition key value is offered to both.
    const held = [first.holds("S:c-1"), second.holds("S:c-1")];

    // Then one holds it and the other does not.
    assertArrayIncludes(held, true);
    assertFalse(held.every(Boolean));
  });

  it.each([0, -1, 1.5, 1_000_001, NaN])(
    "refuses a TotalSegments of %s",
    (totalSegments) => {
      // Given nothing but the division a request asked for.
      // When a segment is made of a TotalSegments outside the range.
      const error = assertThrowsError(
        () => new SimDynamoDbScanSegment({ index: 0, totalSegments }),
      );

      // Then it is refused, naming the parameter that was wrong.
      assertInstanceOf(error, SimDynamoDbValidationException);
      assertStringStartsWith(error.message, "TotalSegments");
    },
  );

  it.each([-1, 4, 5, 0.5, NaN])(
    "refuses a Segment of %s out of four",
    (index) => {
      // Given a division into four segments.
      // When a segment names a share that division does not have.
      const error = assertThrowsError(
        () => new SimDynamoDbScanSegment({ index, totalSegments: 4 }),
      );

      // Then it is refused, since a Segment is zero based and below
      // TotalSegments.
      assertInstanceOf(error, SimDynamoDbValidationException);
      assertStringStartsWith(error.message, "Segment");
    },
  );

  it("takes the last segment of a division", () => {
    // Given a division into four segments.
    // When the last of them is named, which is one below TotalSegments.
    const segment = new SimDynamoDbScanSegment({ index: 3, totalSegments: 4 });

    // Then it is a segment, since Segment is zero based.
    assertIdentical(segment.index, 3);
  });
});
