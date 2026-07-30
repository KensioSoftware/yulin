import { createHash } from "node:crypto";
import { SendMessageBatchCommand } from "@aws-sdk/client-sqs";
import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  SimSqsBatchEntryIdsNotDistinct,
  SimSqsEmptyBatchRequest,
  SimSqsInvalidBatchEntryId,
  SimSqsTooManyEntriesInBatchRequest,
} from "../../error/sim-sqs.error.js";
import { simAwsWithQueue } from "../../../../../test/sqs/queue-fixture.js";

describe("SQS SendMessageBatch", () => {
  it("sends every entry and reports each under its own id", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When two messages are sent as a batch.
    const sent = await simAws.sqs().sendMessageBatch(
      new SendMessageBatchCommand({
        QueueUrl: queueUrl,
        Entries: [
          { Id: "one", MessageBody: "order-1" },
          { Id: "two", MessageBody: "order-2" },
        ],
      }),
    );

    // Then both went through, each carrying its own digest.
    const first = sent.Successful?.[0];

    assertArrayEquals(
      sent.Successful?.map((entry) => entry.Id),
      ["one", "two"],
    );
    assertNonNullable(first);
    assertIdentical(
      first.MD5OfMessageBody,
      createHash("md5").update("order-1", "utf8").digest("hex"),
    );
    assertArrayLength(sent.Failed ?? [], 0);
  });

  it("reports one failed entry while the rest of the batch goes through", async () => {
    // Given a queue with a small maximum message size.
    const { simAws, queueUrl } = await simAwsWithQueue({
      MaximumMessageSize: "1024",
    });

    // When a batch carrying one oversized message is sent.
    const sent = await simAws.sqs().sendMessageBatch(
      new SendMessageBatchCommand({
        QueueUrl: queueUrl,
        Entries: [
          { Id: "one", MessageBody: "order-1" },
          { Id: "two", MessageBody: "x".repeat(1025) },
        ],
      }),
    );

    // Then the good one is sent and the bad one is reported on its own.
    const failed = sent.Failed?.[0];

    assertArrayEquals(
      sent.Successful?.map((entry) => entry.Id),
      ["one"],
    );
    assertNonNullable(failed);
    assertIdentical(failed.Id, "two");
    assertIdentical(failed.Code, "InvalidParameterValue");
    assertTrue(failed.SenderFault);
  });

  it("refuses a batch with no entries", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When an empty batch is sent.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .sqs()
        .sendMessageBatch(
          new SendMessageBatchCommand({ QueueUrl: queueUrl, Entries: [] }),
        );
    });

    // Then the whole request is refused.
    assertInstanceOf(error, SimSqsEmptyBatchRequest);
  });

  it("refuses a batch of more than ten entries", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When eleven messages are sent at once.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().sendMessageBatch(
        new SendMessageBatchCommand({
          QueueUrl: queueUrl,
          Entries: Array.from({ length: 11 }, (_, index) => ({
            Id: `entry-${String(index)}`,
            MessageBody: "order",
          })),
        }),
      );
    });

    // Then the whole request is refused.
    assertInstanceOf(error, SimSqsTooManyEntriesInBatchRequest);
  });

  it("refuses two entries sharing an id", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When two entries carry the same id.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().sendMessageBatch(
        new SendMessageBatchCommand({
          QueueUrl: queueUrl,
          Entries: [
            { Id: "one", MessageBody: "order-1" },
            { Id: "one", MessageBody: "order-2" },
          ],
        }),
      );
    });

    // Then the whole request is refused.
    assertInstanceOf(error, SimSqsBatchEntryIdsNotDistinct);
  });

  it("refuses an entry id real SQS would refuse", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When an entry id carries a disallowed character.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().sendMessageBatch(
        new SendMessageBatchCommand({
          QueueUrl: queueUrl,
          Entries: [{ Id: "one two", MessageBody: "order-1" }],
        }),
      );
    });

    // Then the whole request is refused.
    assertInstanceOf(error, SimSqsInvalidBatchEntryId);
  });

  it("refuses an entry with no id", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When an entry carries no id at all.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().sendMessageBatch({
        input: { QueueUrl: queueUrl, Entries: [{ MessageBody: "order-1" }] },
      });
    });

    // Then the whole request is refused.
    assertInstanceOf(error, SimSqsInvalidBatchEntryId);
  });
});
