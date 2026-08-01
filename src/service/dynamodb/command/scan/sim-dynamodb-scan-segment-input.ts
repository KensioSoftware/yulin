import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import { SimDynamoDbScanSegment } from "../../table/sim-dynamodb-scan-segment.js";
import type { SimScanCommandInput } from "./scan.command.js";

/**
 * Read the segment of the table a scan request reads.
 *
 * `Segment` and `TotalSegments` are supplied together or not at all. One
 * without the other is refused rather than defaulted, since either default
 * would answer with items the request did not ask for: a missing
 * `TotalSegments` cannot be guessed, and a missing `Segment` would read a share
 * of the table the caller never named.
 *
 * A request naming neither reads the whole table, which is a scan of one
 * segment out of one.
 */
export function readSimDynamoDbScanSegment(
  input: SimScanCommandInput,
): SimDynamoDbScanSegment {
  const { Segment: index, TotalSegments: totalSegments } = input;

  if (index === undefined && totalSegments === undefined) {
    return SimDynamoDbScanSegment.whole();
  }

  if (totalSegments === undefined) {
    throw new SimDynamoDbValidationException(
      "The TotalSegments parameter is required but was not present in the " +
        "request when Segment parameter is present",
    );
  }

  if (index === undefined) {
    throw new SimDynamoDbValidationException(
      "The Segment parameter is required but was not present in the request " +
        "when parameter TotalSegments is present",
    );
  }

  return new SimDynamoDbScanSegment({ index, totalSegments });
}
