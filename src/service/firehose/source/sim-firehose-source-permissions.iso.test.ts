import { PutRecordCommand } from "@aws-sdk/client-kinesis";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertTrue,
} from "@kensio/smartass";
import { describe, it, vi } from "vitest";

import {
  deliveredObjectKeys,
  makeFirehoseDeliveryDestination,
} from "../../../../test/firehose/firehose-delivery-fixture.js";
import { makeFirehoseKinesisSource } from "../../../../test/firehose/firehose-kinesis-source-fixture.js";
import { SimAws } from "../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../iam/error/sim-iam.error.js";
import { simFirehoseDeliveryStreamFactory } from "../stream/sim-firehose-delivery-stream.factory.js";

describe("The Role a simulated Firehose delivery stream reads its source as", () => {
  /**
   * Put one order onto the source stream and let the buffering interval pass.
   */
  async function putAndDeliver(
    simAws: SimAws,
    streamName: string,
  ): Promise<void> {
    await simAws.kinesis().putRecord(
      new PutRecordCommand({
        StreamName: streamName,
        PartitionKey: "order-1",
        Data: new TextEncoder().encode('{"id":"order-1"}\n'),
      }),
    );
    await simAws.clock().advanceBy({ minutes: 2 });
  }

  it("stops the delivery when the Role cannot read the stream", async () => {
    // Given a delivery stream whose source Role may describe the stream and
    // not read it.
    const simAws = new SimAws();
    const { bucketName, streamName, streamArn, sourceRoleArn } =
      await makeFirehoseKinesisSource(simAws, {
        sourceActions: ["kinesis:DescribeStream", "kinesis:GetShardIterator"],
      });

    // When a record is put on the stream and the interval passes.
    await putAndDeliver(simAws, streamName);

    // Then nothing was delivered, and the simulator holds the refusal with the
    // stream and the Role it was reading as.
    assertArrayEmpty(await deliveredObjectKeys(simAws, bucketName));

    const failures = simAws.firehose().getSourceFailures();
    assertArrayLength(failures, 1);

    const [failure] = failures;
    assertNonNullable(failure, "The read failed and was recorded");
    assertIdentical(failure.deliveryStreamName, "order-events");
    assertIdentical(failure.streamArn, streamArn);
    assertIdentical(failure.roleArn, sourceRoleArn);
    assertInstanceOf(failure.error, SimIamAccessDenied);
    assertTrue(failure.wasRefused);
    assertStringIncludes(failure.reason, "kinesis:GetRecords");
  });

  it("stops before it starts when the Role cannot find the shards", async () => {
    // Given a delivery stream whose source Role may do nothing on the stream.
    const simAws = new SimAws();
    const { streamName } = await makeFirehoseKinesisSource(simAws, {
      sourceActions: ["kinesis:ListStreams"],
    });

    // Then the delivery stream was created, and the refusal is already
    // recorded: finding the shards is a DescribeStream call made as the Role
    // before CreateDeliveryStream answers.
    const failures = simAws.firehose().getSourceFailures();
    assertArrayLength(failures, 1);
    assertStringIncludes(failures[0].reason, "kinesis:DescribeStream");

    // When a record is put and the interval passes.
    await putAndDeliver(simAws, streamName);

    // Then it stayed at one failure. A delivery stream that gave up on its
    // source does not go round again.
    assertArrayLength(simAws.firehose().getSourceFailures(), 1);
  });

  it("records one failure and stops for a Role refused mid-stream", async () => {
    // Given a delivery stream reading a stream, whose source Role loses its
    // read permission after it started.
    const simAws = new SimAws();
    const { streamName } = await makeFirehoseKinesisSource(simAws);

    await simAws.iam().deleteRolePolicy({
      input: {
        RoleName: "OrderStreamSourceRole",
        PolicyName: "ReadOrders",
      },
    });

    // When two records are put in separate intervals.
    await putAndDeliver(simAws, streamName);
    await putAndDeliver(simAws, streamName);

    // Then it gave up on the first refusal rather than recording one per put.
    assertArrayLength(simAws.firehose().getSourceFailures(), 1);
  });

  it("warns about a source stream that is not there", async () => {
    // Given a delivery stream reading a stream nothing created.
    const simAws = new SimAws();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { bucketName, roleArn } =
      await makeFirehoseDeliveryDestination(simAws);

    await simFirehoseDeliveryStreamFactory.make(
      {
        bucketName,
        roleArn,
        sourceStreamArn: "arn:aws:kinesis:us-east-1:888888888888:stream/absent",
      },
      simAws,
    );

    // Then the failure was recorded, it is not a refusal, and the console was
    // warned. A stream that is not there is a broken simulation rather than a
    // modelled outcome, and a test that never reads the failures should still
    // hear about it.
    const failures = simAws.firehose().getSourceFailures();
    assertArrayLength(failures, 1);

    const [failure] = failures;
    assertNonNullable(failure, "The read failed and was recorded");
    assertFalse(failure.wasRefused);
    assertArrayLength(warn.mock.calls, 1);

    const [warning] = warn.mock.calls;
    assertNonNullable(warning, "The failed read was warned about");
    assertStringIncludes(String(warning[0]), "stream/absent");
  });

  it("reads as the Role rather than as whoever created the delivery stream", async () => {
    // Given a delivery stream whose source Role may read the stream, created
    // by a caller who has no Kinesis permission at all.
    const simAws = new SimAws();
    const { bucketName, streamName } = await makeFirehoseKinesisSource(simAws);

    // When a record is put and the interval passes.
    await putAndDeliver(simAws, streamName);

    // Then it arrived. The read is the delivery stream's own, made as its
    // source Role.
    assertArrayLength(await deliveredObjectKeys(simAws, bucketName), 1);
    assertArrayEmpty(simAws.firehose().getSourceFailures());
  });
});
