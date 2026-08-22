import type { SimFirehoseDeliveryStream } from "../../stream/sim-firehose-delivery-stream.js";
import type {
  SimFirehoseDeliveryStreamDescription,
  SimFirehoseDestinationDescription,
} from "./stream.command.js";

/**
 * The id real Firehose gives a delivery stream's first destination.
 *
 * A delivery stream has one destination, so every simulated delivery stream
 * reports this one.
 */
const firstDestinationId = "destinationId-000000000001";

/**
 * The compression every simulated delivery stream reports.
 *
 * GZIP, Snappy and ZIP all change the bytes in the Object without changing what
 * a test is checking, so nothing here compresses a buffer.
 */
const uncompressed = "UNCOMPRESSED";

/**
 * One delivery stream, as DescribeDeliveryStream reports it.
 */
export function deliveryStreamDescription(
  deliveryStream: SimFirehoseDeliveryStream,
): SimFirehoseDeliveryStreamDescription {
  return {
    DeliveryStreamName: deliveryStream.name,
    DeliveryStreamARN: deliveryStream.arn,
    DeliveryStreamStatus: deliveryStream.status,
    DeliveryStreamType: deliveryStream.deliveryStreamType,
    VersionId: deliveryStream.versionId,
    CreateTimestamp: deliveryStream.createdAt,
    Destinations: [destinationDescription(deliveryStream)],
    HasMoreDestinations: false,
  };
}

function destinationDescription(
  deliveryStream: SimFirehoseDeliveryStream,
): SimFirehoseDestinationDescription {
  const { destination } = deliveryStream;
  const { bufferingHints } = destination;

  return {
    DestinationId: firstDestinationId,
    ExtendedS3DestinationDescription: {
      RoleARN: destination.roleArn,
      BucketARN: destination.bucketArn,
      Prefix: destination.prefix,
      ErrorOutputPrefix: destination.errorOutputPrefix,
      BufferingHints: {
        SizeInMBs: bufferingHints.sizeInMegabytes,
        IntervalInSeconds: bufferingHints.intervalInSeconds,
      },
      CompressionFormat: uncompressed,
    },
  };
}
