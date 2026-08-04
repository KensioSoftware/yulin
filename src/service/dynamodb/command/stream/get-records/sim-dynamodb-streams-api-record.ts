import type { AwsRegionName } from "../../../../aws/sim-aws-region.js";
import type { SimDynamoDbStreamRecord } from "../../../stream/sim-dynamodb-stream-record.js";
import type {
  SimDynamoDbStreamsIdentity,
  SimDynamoDbStreamsRecord,
} from "../stream.types.js";

/**
 * The record format version the Streams API reports.
 *
 * AWS documents this as subject to change and tells clients not to depend on
 * a particular value. It is here because a record carries it, not because
 * anything should be read from it.
 */
const eventVersion = "1.1";

/**
 * Who made a change, as the Streams API capitalizes it.
 *
 * The Lambda event carries the same two values under `principalId` and `type`,
 * which is why the stored record keeps them in its own terms and each surface
 * renders its own. Sharing one payload between the two would leave one of them
 * quietly wrong.
 */
function identityOf(
  record: SimDynamoDbStreamRecord,
): SimDynamoDbStreamsIdentity | undefined {
  if (record.userIdentity === undefined) {
    return undefined;
  }

  return {
    PrincipalId: record.userIdentity.principalId,
    Type: record.userIdentity.type,
  };
}

/**
 * Render a captured record the way the DynamoDB Streams API hands it back.
 *
 * `ApproximateCreationDateTime` is a Date here, where the Lambda event has
 * epoch seconds in the same place. The SDK deserializes a timestamp into a
 * Date, so this is what an application reading GetRecords already expects.
 */
export function simDynamoDbStreamsApiRecord(
  record: SimDynamoDbStreamRecord,
  awsRegion: AwsRegionName,
): SimDynamoDbStreamsRecord {
  return {
    eventID: record.eventId,
    eventName: record.eventName,
    eventVersion,
    eventSource: "aws:dynamodb",
    awsRegion,
    dynamodb: {
      ApproximateCreationDateTime: record.approximateCreationDateTime,
      Keys: record.keys.toAttributeValues(),
      NewImage: record.newImage?.toAttributeValues(),
      OldImage: record.oldImage?.toAttributeValues(),
      SequenceNumber: record.sequenceNumber,
      SizeBytes: record.sizeBytes,
      StreamViewType: record.streamViewType,
    },
    userIdentity: identityOf(record),
  };
}
