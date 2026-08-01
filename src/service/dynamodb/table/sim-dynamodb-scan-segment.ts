import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import { simDynamoDbPartitionKeyHash } from "./sim-dynamodb-partition-key-hash.js";

/**
 * The most segments a parallel scan can be divided into, as on AWS.
 */
const greatestTotalSegments = 1_000_000;

interface SimDynamoDbScanSegmentProperties {
  readonly index: number;
  readonly totalSegments: number;
}

/**
 * One segment of a parallel scan.
 *
 * A segment is a share of the table's partition key values rather than a share
 * of its items. Every item under one partition key belongs to one segment, so a
 * segment holds whole item collections, and two segments of the same table can
 * hold very different numbers of items. A segment holding nothing at all is
 * ordinary rather than a failure.
 *
 * There is no concurrency to gain here, since a simulated scan walks a map in
 * memory. What a segment models is the caller's side of a parallel scan: code
 * that divides a table between workers can be run against a simulated table.
 */
export class SimDynamoDbScanSegment {
  /** The zero based number of this segment. */
  public readonly index: number;

  /** How many segments the table is divided into. */
  public readonly totalSegments: number;

  constructor(properties: SimDynamoDbScanSegmentProperties) {
    assertTotalSegments(properties.totalSegments);
    assertIndex(properties.index, properties.totalSegments);

    this.index = properties.index;
    this.totalSegments = properties.totalSegments;
  }

  /**
   * The whole table as one segment, which is what a sequential scan reads.
   */
  static whole(): SimDynamoDbScanSegment {
    return new this({ index: 0, totalSegments: 1 });
  }

  /**
   * Whether this segment holds the items under a marshalled partition key.
   *
   * A `TotalSegments` of 1 holds everything, which is what makes a parallel
   * scan of one segment the same read as a sequential scan.
   */
  holds(partitionKey: string): boolean {
    return (
      simDynamoDbPartitionKeyHash(partitionKey) % this.totalSegments ===
      this.index
    );
  }
}

/**
 * Refuse a `TotalSegments` outside the range a parallel scan takes.
 */
function assertTotalSegments(totalSegments: number): void {
  if (
    !Number.isSafeInteger(totalSegments) ||
    totalSegments < 1 ||
    totalSegments > greatestTotalSegments
  ) {
    throw new SimDynamoDbValidationException(
      `TotalSegments ${totalSegments.toString()} is invalid. It is a whole ` +
        `number between 1 and ${greatestTotalSegments.toString()}.`,
    );
  }
}

/**
 * Refuse a `Segment` that names no segment of the division asked for.
 */
function assertIndex(index: number, totalSegments: number): void {
  if (!Number.isSafeInteger(index) || index < 0 || index >= totalSegments) {
    throw new SimDynamoDbValidationException(
      `Segment ${index.toString()} is invalid. It is zero based, so it is a ` +
        `whole number between 0 and ${(totalSegments - 1).toString()} for a ` +
        `TotalSegments of ${totalSegments.toString()}.`,
    );
  }
}
