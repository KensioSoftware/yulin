import {
  ListDeliveryStreamsCommand,
  PutRecordBatchCommand,
  PutRecordCommand,
} from "@aws-sdk/client-firehose";
import {
  assertArrayEquals,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { makeFirehoseDeliveryDestination } from "../../../../test/firehose/firehose-delivery-fixture.js";
import { makeFirehoseKinesisSource } from "../../../../test/firehose/firehose-kinesis-source-fixture.js";
import { SimAws } from "../../aws/sim-aws.js";
import {
  SimFirehoseInvalidArgumentException,
  SimFirehoseUnsimulatedSource,
} from "../error/sim-firehose.error.js";
import { simFirehoseDeliveryStreamFactory } from "../stream/sim-firehose-delivery-stream.factory.js";
import type { SimCreateDeliveryStreamCommandInput } from "../command/stream/stream.command.js";

describe("What a simulated Firehose delivery stream refuses to read", () => {
  /**
   * Create a delivery stream against a Bucket that exists, and answer with
   * what the request was refused with.
   */
  async function refusalOf(
    input: Omit<SimCreateDeliveryStreamCommandInput, "DeliveryStreamName">,
  ): Promise<Error> {
    const simAws = new SimAws();
    const { bucketName, roleArn } =
      await makeFirehoseDeliveryDestination(simAws);

    return await assertThrowsErrorAsync(async () => {
      await simAws.firehose().createDeliveryStream({
        input: {
          DeliveryStreamName: "order-events",
          ExtendedS3DestinationConfiguration: {
            BucketARN: `arn:aws:s3:::${bucketName}`,
            RoleARN: roleArn,
          },
          ...input,
        },
      });
    });
  }

  /**
   * A source configuration naming a stream ARN, as a request carries it.
   */
  function sourceConfiguration(
    streamArn: string,
  ): SimCreateDeliveryStreamCommandInput {
    return {
      DeliveryStreamType: "KinesisStreamAsSource",
      KinesisStreamSourceConfiguration: {
        KinesisStreamARN: streamArn,
        RoleARN: "arn:aws:iam::888888888888:role/OrderStreamSourceRole",
      },
    };
  }

  it("refuses a source stream in another region", async () => {
    // Given a delivery stream that would read a stream in another region.
    const error = await refusalOf(
      sourceConfiguration(
        "arn:aws:kinesis:eu-west-2:888888888888:stream/orders",
      ),
    );

    // Then it says so. A simulated Firehose reads the simulated Kinesis of its
    // own scope, and nothing else is there to read.
    assertInstanceOf(error, SimFirehoseUnsimulatedSource);
    assertStringIncludes(error.message, "eu-west-2");
  });

  it("refuses a source stream in another account", async () => {
    // Given a delivery stream that would read another account's stream.
    const error = await refusalOf(
      sourceConfiguration(
        "arn:aws:kinesis:us-east-1:111111111111:stream/orders",
      ),
    );

    // Then it is refused the same way.
    assertInstanceOf(error, SimFirehoseUnsimulatedSource);
    assertStringIncludes(error.message, "111111111111");
  });

  it("refuses a source that is not a stream ARN", async () => {
    // Given a source naming a stream consumer rather than the stream.
    const error = await refusalOf(
      sourceConfiguration(
        "arn:aws:kinesis:us-east-1:888888888888:stream/orders/consumer/archive:1",
      ),
    );

    // Then it is refused as a malformed request, and told the shape it wanted.
    assertInstanceOf(error, SimFirehoseInvalidArgumentException);
    assertStringIncludes(error.message, "arn:aws:kinesis:<region>");
  });

  it("refuses a source configuration naming no stream", async () => {
    // Given a source configuration with no KinesisStreamARN.
    const error = await refusalOf({
      DeliveryStreamType: "KinesisStreamAsSource",
      KinesisStreamSourceConfiguration: {
        RoleARN: "arn:aws:iam::888888888888:role/OrderStreamSourceRole",
      },
    });

    // Then it says which field is missing.
    assertInstanceOf(error, SimFirehoseInvalidArgumentException);
    assertStringIncludes(error.message, "KinesisStreamARN");
  });

  it("refuses a source configuration naming no Role", async () => {
    // Given a source configuration with no RoleARN.
    const error = await refusalOf({
      DeliveryStreamType: "KinesisStreamAsSource",
      KinesisStreamSourceConfiguration: {
        KinesisStreamARN:
          "arn:aws:kinesis:us-east-1:888888888888:stream/orders",
      },
    });

    // Then it says which field is missing. The read is made as that Role, and
    // there is nothing to make it as.
    assertInstanceOf(error, SimFirehoseInvalidArgumentException);
    assertStringIncludes(error.message, "RoleARN");
  });

  it("refuses a Kinesis-sourced delivery stream naming no source", async () => {
    // Given a delivery stream of that type carrying no configuration.
    const error = await refusalOf({
      DeliveryStreamType: "KinesisStreamAsSource",
    });

    // Then it says what it wanted, rather than reading nothing.
    assertInstanceOf(error, SimFirehoseInvalidArgumentException);
    assertStringIncludes(error.message, "KinesisStreamSourceConfiguration");
  });

  it("refuses a source configuration on a DirectPut delivery stream", async () => {
    // Given a delivery stream that takes puts and names a stream as well.
    const error = await refusalOf({
      KinesisStreamSourceConfiguration: {
        KinesisStreamARN:
          "arn:aws:kinesis:us-east-1:888888888888:stream/orders",
        RoleARN: "arn:aws:iam::888888888888:role/OrderStreamSourceRole",
      },
    });

    // Then it is refused rather than taken as one or the other.
    assertInstanceOf(error, SimFirehoseInvalidArgumentException);
    assertStringIncludes(error.message, "KinesisStreamAsSource");
  });

  it("refuses a source outside the simulation by name", async () => {
    // Given a delivery stream reading an MSK cluster.
    const error = await refusalOf({ DeliveryStreamType: "MSKAsSource" });

    // Then it says which type it was asked for. A delivery stream reading a
    // cluster nothing simulates would take nothing and deliver nothing.
    assertInstanceOf(error, SimFirehoseUnsimulatedSource);
    assertStringIncludes(error.message, "MSKAsSource");
  });

  it("refuses a record put onto a delivery stream that reads a stream", async () => {
    // Given a delivery stream reading a Kinesis stream.
    const simAws = new SimAws();
    const { deliveryStream, streamArn } =
      await makeFirehoseKinesisSource(simAws);

    // When a producer puts a record onto the delivery stream itself.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.firehose().putRecord(
        new PutRecordCommand({
          DeliveryStreamName: deliveryStream.name,
          Record: { Data: new TextEncoder().encode("one\n") },
        }),
      );
    });

    // Then it is refused, and pointed at the stream the records come from.
    assertInstanceOf(error, SimFirehoseInvalidArgumentException);
    assertStringIncludes(error.message, "PutRecord");
    assertStringIncludes(error.message, streamArn);
  });

  it("refuses a batch put onto a delivery stream that reads a stream", async () => {
    // Given a delivery stream reading a Kinesis stream.
    const simAws = new SimAws();
    const { deliveryStream } = await makeFirehoseKinesisSource(simAws);

    // When a producer puts a batch onto the delivery stream itself.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.firehose().putRecordBatch(
        new PutRecordBatchCommand({
          DeliveryStreamName: deliveryStream.name,
          Records: [{ Data: new TextEncoder().encode("one\n") }],
        }),
      );
    });

    // Then it is refused the same way.
    assertInstanceOf(error, SimFirehoseInvalidArgumentException);
    assertStringIncludes(error.message, "PutRecordBatch");
  });

  it("lists delivery streams by the source they read", async () => {
    // Given one delivery stream of each type.
    const simAws = new SimAws();
    const { deliveryStream, bucketName } =
      await makeFirehoseKinesisSource(simAws);
    await simFirehoseDeliveryStreamFactory.make(
      { deliveryStreamName: "direct-orders", bucketName },
      simAws,
    );

    // When a listing asks for the ones reading a Kinesis stream.
    const listed = await simAws.firehose().listDeliveryStreams(
      new ListDeliveryStreamsCommand({
        DeliveryStreamType: "KinesisStreamAsSource",
      }),
    );

    // Then only that one is listed.
    assertArrayEquals(listed.DeliveryStreamNames, [deliveryStream.name]);
  });
});
