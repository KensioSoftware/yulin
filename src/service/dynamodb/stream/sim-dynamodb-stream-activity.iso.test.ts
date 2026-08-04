import { PutItemCommand } from "@aws-sdk/client-dynamodb";
import { assertIdentical, assertUndefined } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimDynamoDbStreamWatcher } from "./sim-dynamodb-stream-activity.js";
import { simDynamoDbStreamedTableFactory } from "./sim-dynamodb-streamed-table.factory.js";

/**
 * A consumer that counts how often it was told to look.
 */
class CountingWatcher implements SimDynamoDbStreamWatcher {
  public count = 0;

  recordsAvailable(): void {
    this.count += 1;
  }
}

/**
 * Write an order onto the streamed table.
 */
async function putOrder(simAws: SimAws, orderId: string): Promise<void> {
  await simAws.dynamoDb().putItem(
    new PutItemCommand({
      TableName: "orders",
      Item: { orderId: { S: orderId } },
    }),
  );
}

describe("DynamoDB stream activity", () => {
  it("tells a watcher when a record is written", async () => {
    // Given something watching a table's stream.
    const simAws = new SimAws();
    const table = await simDynamoDbStreamedTableFactory.make({}, simAws);
    const streamArn = table.stream.current?.arn;
    assertDefined(streamArn, "stream ARN");
    const watcher = new CountingWatcher();
    simAws.dynamoDb().streamActivity().watch(streamArn, watcher);

    // When two items are written.
    await putOrder(simAws, "order-1");
    await putOrder(simAws, "order-2");

    // Then it was told about each, which is what stands in for the continuous
    // polling nothing here can do.
    assertIdentical(watcher.count, 2);
  });

  it("stops telling a watcher that has stopped watching", async () => {
    // Given a watcher that has been told about one record and stopped.
    const simAws = new SimAws();
    const table = await simDynamoDbStreamedTableFactory.make({}, simAws);
    const streamArn = table.stream.current?.arn;
    assertDefined(streamArn, "stream ARN");
    const watcher = new CountingWatcher();
    const activity = simAws.dynamoDb().streamActivity();
    activity.watch(streamArn, watcher);
    await putOrder(simAws, "order-1");
    activity.unwatch(streamArn, watcher);

    // When another item is written.
    await putOrder(simAws, "order-2");

    // Then it hears nothing more.
    assertIdentical(watcher.count, 1);
  });

  it("finds a stream by the ARN a table reports", async () => {
    // Given a table with a stream.
    const simAws = new SimAws();
    const table = await simDynamoDbStreamedTableFactory.make({}, simAws);
    const streamArn = table.stream.current?.arn;
    assertDefined(streamArn, "stream ARN");

    // Then the service resolves that ARN to the stream it names, and an ARN
    // naming nothing to nothing.
    assertIdentical(
      simAws.dynamoDb().findStream(streamArn),
      table.stream.current,
    );
    assertUndefined(simAws.dynamoDb().findStream(`${streamArn}-other`));
  });
});
