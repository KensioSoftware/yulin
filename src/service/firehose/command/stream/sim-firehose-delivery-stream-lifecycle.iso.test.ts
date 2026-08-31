/* oxlint-disable typescript/no-deprecated -- Firehose's
 * S3DestinationConfiguration is deprecated in favour of the extended one, and
 * a delivery stream declared the older way still has to work. */

import {
  CreateDeliveryStreamCommand,
  DeleteDeliveryStreamCommand,
  DescribeDeliveryStreamCommand,
  ListDeliveryStreamsCommand,
} from "@aws-sdk/client-firehose";
import { CreateBucketCommand } from "@aws-sdk/client-s3";
import {
  assertArrayEmpty,
  assertArrayEquals,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimFirehoseInvalidArgumentException,
  SimFirehoseResourceInUseException,
  SimFirehoseResourceNotFoundException,
} from "../../error/sim-firehose.error.js";
import { simFirehoseDeliveryStreamFactory } from "../../stream/sim-firehose-delivery-stream.factory.js";

/**
 * A simulated AWS with a Bucket for a delivery stream to write into.
 */
async function simAwsWithBucket(): Promise<SimAws> {
  const simAws = new SimAws();

  await simAws
    .s3()
    .createBucket(new CreateBucketCommand({ Bucket: "order-archive" }));

  return simAws;
}

describe("Simulated Firehose delivery stream lifecycle", () => {
  it("lists and describes a delivery stream it created", async () => {
    // Given a simulated AWS with a Bucket and no delivery streams.
    const simAws = await simAwsWithBucket();

    // When a delivery stream is created against that Bucket.
    const created = await simAws.firehose().createDeliveryStream(
      new CreateDeliveryStreamCommand({
        DeliveryStreamName: "order-events",
        ExtendedS3DestinationConfiguration: {
          BucketARN: "arn:aws:s3:::order-archive",
          RoleARN: "arn:aws:iam::888888888888:role/OrderArchiveRole",
          Prefix: "orders/",
          BufferingHints: { SizeInMBs: 8, IntervalInSeconds: 120 },
        },
      }),
    );

    // Then it answers with the ARN, and the delivery stream lists and
    // describes.
    assertIdentical(
      created.DeliveryStreamARN,
      `arn:aws:firehose:${simAws.defaultRegionName}:${simAws.defaultAccountId}:deliverystream/order-events`,
    );

    const listed = await simAws
      .firehose()
      .listDeliveryStreams(new ListDeliveryStreamsCommand({}));
    assertArrayEquals(listed.DeliveryStreamNames, ["order-events"]);
    assertFalse(listed.HasMoreDeliveryStreams);

    const { DeliveryStreamDescription } = await simAws
      .firehose()
      .describeDeliveryStream(
        new DescribeDeliveryStreamCommand({
          DeliveryStreamName: "order-events",
        }),
      );
    assertIdentical(DeliveryStreamDescription.DeliveryStreamStatus, "ACTIVE");
    assertIdentical(DeliveryStreamDescription.DeliveryStreamType, "DirectPut");
    assertIdentical(DeliveryStreamDescription.VersionId, "1");
    assertFalse(DeliveryStreamDescription.HasMoreDestinations);

    const [destination] = DeliveryStreamDescription.Destinations;
    assertNonNullable(destination, "The delivery stream has a destination");
    assertIdentical(destination.DestinationId, "destinationId-000000000001");

    const s3 = destination.ExtendedS3DestinationDescription;
    assertIdentical(s3.BucketARN, "arn:aws:s3:::order-archive");
    assertIdentical(s3.Prefix, "orders/");
    assertIdentical(s3.CompressionFormat, "UNCOMPRESSED");
    assertIdentical(s3.BufferingHints.SizeInMBs, 8);
    assertIdentical(s3.BufferingHints.IntervalInSeconds, 120);
  });

  it("gives a delivery stream the buffering Firehose defaults to", async () => {
    // Given a delivery stream declaring no buffering hints.
    const simAws = await simAwsWithBucket();
    await simAws.firehose().createDeliveryStream(
      new CreateDeliveryStreamCommand({
        DeliveryStreamName: "order-events",
        ExtendedS3DestinationConfiguration: {
          BucketARN: "arn:aws:s3:::order-archive",
          RoleARN: "arn:aws:iam::888888888888:role/OrderArchiveRole",
        },
      }),
    );

    // Then it buffers five megabytes or five minutes, and its prefix is the
    // bare date path.
    const { DeliveryStreamDescription } = await simAws
      .firehose()
      .describeDeliveryStream(
        new DescribeDeliveryStreamCommand({
          DeliveryStreamName: "order-events",
        }),
      );
    const [destination] = DeliveryStreamDescription.Destinations;
    assertNonNullable(destination, "The delivery stream has a destination");

    const s3 = destination.ExtendedS3DestinationDescription;
    assertIdentical(s3.BufferingHints.SizeInMBs, 5);
    assertIdentical(s3.BufferingHints.IntervalInSeconds, 300);
    assertIdentical(s3.Prefix, "");
  });

  it("takes the plain S3 destination configuration as well", async () => {
    // Given a delivery stream declared with the older configuration shape.
    const simAws = await simAwsWithBucket();

    // When it is created.
    await simAws.firehose().createDeliveryStream(
      new CreateDeliveryStreamCommand({
        DeliveryStreamName: "order-events",
        S3DestinationConfiguration: {
          BucketARN: "arn:aws:s3:::order-archive",
          RoleARN: "arn:aws:iam::888888888888:role/OrderArchiveRole",
          Prefix: "legacy/",
        },
      }),
    );

    // Then it describes the same way an extended one does.
    const { DeliveryStreamDescription } = await simAws
      .firehose()
      .describeDeliveryStream(
        new DescribeDeliveryStreamCommand({
          DeliveryStreamName: "order-events",
        }),
      );
    const [destination] = DeliveryStreamDescription.Destinations;
    assertNonNullable(destination, "The delivery stream has a destination");
    assertIdentical(
      destination.ExtendedS3DestinationDescription.Prefix,
      "legacy/",
    );
  });

  it("refuses a second delivery stream under a name it holds", async () => {
    // Given a delivery stream.
    const simAws = await simAwsWithBucket();
    await simFirehoseDeliveryStreamFactory.make({}, simAws);

    // When another is created under the same name.
    const error = await assertThrowsErrorAsync(async () => {
      await simFirehoseDeliveryStreamFactory.make({}, simAws);
    });

    // Then it is refused the way real Firehose refuses one.
    assertInstanceOf(error, SimFirehoseResourceInUseException);
    assertIdentical(error.name, "ResourceInUseException");
    assertStringIncludes(error.message, "order-events");
  });

  it("frees the name when a delivery stream is deleted", async () => {
    // Given a delivery stream.
    const simAws = await simAwsWithBucket();
    await simFirehoseDeliveryStreamFactory.make({}, simAws);

    // When it is deleted.
    await simAws.firehose().deleteDeliveryStream(
      new DeleteDeliveryStreamCommand({
        DeliveryStreamName: "order-events",
      }),
    );

    // Then describing it raises, and the name can be taken again.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.firehose().describeDeliveryStream(
        new DescribeDeliveryStreamCommand({
          DeliveryStreamName: "order-events",
        }),
      );
    });
    assertInstanceOf(error, SimFirehoseResourceNotFoundException);
    assertIdentical(error.name, "ResourceNotFoundException");

    await simFirehoseDeliveryStreamFactory.make({}, simAws);
    assertTrue(
      simAws.firehose().findDeliveryStream("order-events") !== undefined,
    );
  });

  it("pages a listing by name", async () => {
    // Given three delivery streams.
    const simAws = await simAwsWithBucket();
    for (const name of ["orders-c", "orders-a", "orders-b"]) {
      // oxlint-disable-next-line no-await-in-loop
      await simFirehoseDeliveryStreamFactory.make(
        { deliveryStreamName: name },
        simAws,
      );
    }

    // When a page of two is asked for.
    const first = await simAws
      .firehose()
      .listDeliveryStreams(new ListDeliveryStreamsCommand({ Limit: 2 }));

    // Then it holds the first two by name, and says there are more.
    assertArrayEquals(first.DeliveryStreamNames, ["orders-a", "orders-b"]);
    assertTrue(first.HasMoreDeliveryStreams);

    // When the next page carries on from the last name.
    const second = await simAws.firehose().listDeliveryStreams(
      new ListDeliveryStreamsCommand({
        Limit: 2,
        ExclusiveStartDeliveryStreamName: "orders-b",
      }),
    );

    // Then it holds the rest.
    assertArrayEquals(second.DeliveryStreamNames, ["orders-c"]);
    assertFalse(second.HasMoreDeliveryStreams);
  });

  it("lists nothing for a delivery stream type nothing has", async () => {
    // Given a DirectPut delivery stream, and nothing reading a stream.
    const simAws = await simAwsWithBucket();
    await simFirehoseDeliveryStreamFactory.make({}, simAws);

    // When a listing asks for Kinesis-sourced delivery streams.
    const listed = await simAws.firehose().listDeliveryStreams(
      new ListDeliveryStreamsCommand({
        DeliveryStreamType: "KinesisStreamAsSource",
      }),
    );

    // Then nothing matches.
    assertArrayEmpty(listed.DeliveryStreamNames);
  });

  it("refuses a request naming no delivery stream", async () => {
    // Given a simulated AWS.
    const simAws = await simAwsWithBucket();

    // When a describe names none.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.firehose().describeDeliveryStream({ input: {} });
    });

    // Then it is refused as a malformed request.
    assertInstanceOf(error, SimFirehoseInvalidArgumentException);
    assertStringIncludes(error.message, "DeliveryStreamName");
  });
});
