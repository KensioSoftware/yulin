import {
  CreateStreamCommand,
  DescribeStreamCommand,
  GetRecordsCommand,
  GetShardIteratorCommand,
  ListStreamsCommand,
  PutRecordCommand,
} from "@aws-sdk/client-kinesis";
import {
  assertArrayEmpty,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simIamRoleWithPolicyFactory } from "../../../iam/role/sim-iam-role-with-policy.factory.js";
import { simKinesisStreamFactory } from "../../stream/sim-kinesis-stream.factory.js";

/**
 * The ARN of the stream every test here is about.
 */
function ordersArn(simAws: SimAws): string {
  return `arn:aws:kinesis:${simAws.defaultRegionName}:${simAws.defaultAccountId}:stream/orders`;
}

describe("Authorizing simulated Kinesis requests", () => {
  it("allows a caller whose policy permits putting to the stream", async () => {
    // Given a stream, and a Role allowed to put records onto it.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({}, simAws);
    const role = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "OrderProducer",
        actions: ["kinesis:PutRecord"],
        resource: ordersArn(simAws),
      },
      simAws,
    );

    // When that Role puts a record.
    const put = await simAws.kinesis().putRecord(
      new PutRecordCommand({
        StreamName: "orders",
        PartitionKey: "customer-1",
        Data: new TextEncoder().encode("order-1"),
      }),
      { caller: { kind: "arn", arn: role.Arn } },
    );

    // Then the record goes on the stream.
    assertIdentical(put.ShardId, "shardId-000000000000");
  });

  it("refuses a caller with no permission to put to the stream", async () => {
    // Given a stream, and a Role allowed to describe it and nothing more.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({}, simAws);
    const role = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "OrderReader",
        actions: ["kinesis:DescribeStream"],
        resource: ordersArn(simAws),
      },
      simAws,
    );

    // When that Role puts a record.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.kinesis().putRecord(
        new PutRecordCommand({
          StreamName: "orders",
          PartitionKey: "customer-1",
          Data: new TextEncoder().encode("order-1"),
        }),
        { caller: { kind: "arn", arn: role.Arn } },
      );
    });

    // Then it is refused, naming the action and the stream it was refused on.
    assertInstanceOf(error, SimIamAccessDenied);
    assertStringIncludes(error.message, "kinesis:PutRecord");
    assertStringIncludes(error.message, ordersArn(simAws));
  });

  it("refuses a caller whose policy names another stream", async () => {
    // Given a stream, and a Role allowed to put onto a different one.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({}, simAws);
    const role = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "EventProducer",
        actions: ["kinesis:PutRecord"],
        resource: `arn:aws:kinesis:${simAws.defaultRegionName}:${simAws.defaultAccountId}:stream/events`,
      },
      simAws,
    );

    // When that Role puts a record onto the orders stream.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.kinesis().putRecord(
        new PutRecordCommand({
          StreamName: "orders",
          PartitionKey: "customer-1",
          Data: new TextEncoder().encode("order-1"),
        }),
        { caller: { kind: "arn", arn: role.Arn } },
      );
    });

    // Then it is refused.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("refuses a caller with no permission to create a stream", async () => {
    // Given a Role allowed to list streams and nothing more.
    const simAws = new SimAws();
    const role = await simIamRoleWithPolicyFactory.make(
      { roleName: "Lister", actions: ["kinesis:ListStreams"] },
      simAws,
    );

    // When that Role creates a stream.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .kinesis()
        .createStream(new CreateStreamCommand({ StreamName: "orders" }), {
          caller: { kind: "arn", arn: role.Arn },
        });
    });

    // Then it is refused, and the Role can still list.
    assertInstanceOf(error, SimIamAccessDenied);

    const listed = await simAws
      .kinesis()
      .listStreams(new ListStreamsCommand({}), {
        caller: { kind: "arn", arn: role.Arn },
      });
    assertArrayEmpty(listed.StreamNames);
  });

  it("refuses a caller with no permission on a stream that does not exist", async () => {
    // Given a simulated AWS with no streams, and a Role allowed nothing.
    const simAws = new SimAws();
    const role = await simIamRoleWithPolicyFactory.make(
      { roleName: "Nobody", actions: [] },
      simAws,
    );

    // When that Role describes a stream that is not there.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .kinesis()
        .describeStream(new DescribeStreamCommand({ StreamName: "orders" }), {
          caller: { kind: "arn", arn: role.Arn },
        });
    });

    // Then it is refused rather than told the stream is missing, which is what
    // keeps an unauthorized caller from finding out which names are taken.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("authorizes a read against the stream the iterator was made on", async () => {
    // Given a stream holding a record, and a Role allowed to take an iterator
    // but not to read records.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({}, simAws);
    await simAws.kinesis().putRecord(
      new PutRecordCommand({
        StreamName: "orders",
        PartitionKey: "customer-1",
        Data: new TextEncoder().encode("order-1"),
      }),
    );
    const role = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "Iterating",
        actions: ["kinesis:GetShardIterator"],
        resource: ordersArn(simAws),
      },
      simAws,
    );
    const iterator = await simAws.kinesis().getShardIterator(
      new GetShardIteratorCommand({
        StreamName: "orders",
        ShardId: "shardId-000000000000",
        ShardIteratorType: "TRIM_HORIZON",
      }),
      { caller: { kind: "arn", arn: role.Arn } },
    );

    // When that Role reads records with the iterator it was given.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .kinesis()
        .getRecords(
          new GetRecordsCommand({ ShardIterator: iterator.ShardIterator }),
          { caller: { kind: "arn", arn: role.Arn } },
        );
    });

    // Then the read is refused on the stream the iterator names.
    assertInstanceOf(error, SimIamAccessDenied);
    assertStringIncludes(error.message, "kinesis:GetRecords");
    assertStringIncludes(error.message, ordersArn(simAws));
  });
});
