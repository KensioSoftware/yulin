import { PutItemCommand, UpdateTableCommand } from "@aws-sdk/client-dynamodb";
import {
  GetRecordsCommand,
  GetShardIteratorCommand,
} from "@aws-sdk/client-dynamodb-streams";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../../aws/sim-aws.js";
import type { SimDynamoDbStream } from "../../../stream/sim-dynamodb-stream.js";
import { simDynamoDbStreamedOrdersFactory } from "../../../stream/sim-dynamodb-streamed-orders.factory.js";

/**
 * A TRIM_HORIZON iterator for the one shard of a stream.
 */
async function trimHorizonIterator(
  simAws: SimAws,
  stream: SimDynamoDbStream,
): Promise<string | undefined> {
  const output = await simAws.dynamoDbStreams().getShardIterator(
    new GetShardIteratorCommand({
      StreamArn: stream.arn,
      ShardId: stream.shard.shardId,
      ShardIteratorType: "TRIM_HORIZON",
    }),
  );

  return output.ShardIterator;
}

describe("DynamoDB Streams GetRecords", () => {
  it("walks the whole log and then answers empty without ending", async () => {
    // Given a stream with three records on it, read one at a time.
    const simAws = new SimAws();
    const stream = await simDynamoDbStreamedOrdersFactory.make(
      { orders: 3 },
      simAws,
    );
    let iterator = await trimHorizonIterator(simAws, stream);
    const read: string[] = [];

    // When each successive NextShardIterator is followed four times: three
    // that have a record for them and one that has caught up.
    for (let poll = 0; poll < 4; poll += 1) {
      // oxlint-disable-next-line no-await-in-loop
      const output = await simAws
        .dynamoDbStreams()
        .getRecords(
          new GetRecordsCommand({ ShardIterator: iterator, Limit: 1 }),
        );

      read.push(
        ...(output.Records ?? []).map(
          (record) => record.dynamodb?.Keys?.["orderId"]?.S ?? "",
        ),
      );
      iterator = output.NextShardIterator;
    }

    // Then every record was read once, and the caught-up reader was handed an
    // iterator to carry on with rather than being told the shard had ended.
    assertIdentical(read.join(","), "order-1,order-2,order-3");
    assertNonNullable(iterator);
  });

  it("hands back an empty batch and a live iterator when caught up", async () => {
    // Given a stream that has been read to the end.
    const simAws = new SimAws();
    const stream = await simDynamoDbStreamedOrdersFactory.make({}, simAws);
    const iterator = await trimHorizonIterator(simAws, stream);
    const first = await simAws
      .dynamoDbStreams()
      .getRecords(new GetRecordsCommand({ ShardIterator: iterator }));

    // When the reader polls again with nothing new written.
    const second = await simAws
      .dynamoDbStreams()
      .getRecords(
        new GetRecordsCommand({ ShardIterator: first.NextShardIterator }),
      );

    // Then the empty batch is the ordinary answer, and the reader can go on.
    assertArrayLength(second.Records, 0);
    assertNonNullable(second.NextShardIterator);

    // And a record written afterwards is read from that same iterator.
    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: "orders",
        Item: { orderId: { S: "order-2" } },
      }),
    );
    const third = await simAws
      .dynamoDbStreams()
      .getRecords(
        new GetRecordsCommand({ ShardIterator: second.NextShardIterator }),
      );
    assertArrayLength(third.Records, 1);
  });

  it("drops NextShardIterator once a disabled stream is drained", async () => {
    // Given a stream with two records on it whose table has switched it off.
    const simAws = new SimAws();
    const stream = await simDynamoDbStreamedOrdersFactory.make(
      { orders: 2 },
      simAws,
    );
    const iterator = await trimHorizonIterator(simAws, stream);

    await simAws.dynamoDb().updateTable(
      new UpdateTableCommand({
        TableName: "orders",
        StreamSpecification: { StreamEnabled: false },
      }),
    );
    await simAws.backgroundTasksComplete();

    // When the closed shard is read one record at a time.
    const first = await simAws
      .dynamoDbStreams()
      .getRecords(new GetRecordsCommand({ ShardIterator: iterator, Limit: 1 }));

    // Then there is still somewhere to go while records remain.
    assertArrayLength(first.Records, 1);
    assertNonNullable(first.NextShardIterator);

    // And the read that empties the shard ends it.
    const second = await simAws
      .dynamoDbStreams()
      .getRecords(
        new GetRecordsCommand({ ShardIterator: first.NextShardIterator }),
      );
    assertArrayLength(second.Records, 1);
    assertUndefined(second.NextShardIterator);
  });
});
