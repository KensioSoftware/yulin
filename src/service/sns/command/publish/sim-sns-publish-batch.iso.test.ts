import { PublishBatchCommand } from "@aws-sdk/client-sns";
import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertSetSize,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { simAwsWithTopic } from "../../../../../test/sns/topic-fixture.js";
import {
  SimSnsBatchEntryIdsNotDistinctException,
  SimSnsBatchRequestTooLongException,
  SimSnsEmptyBatchRequestException,
  SimSnsInvalidBatchEntryIdException,
  SimSnsTooManyEntriesInBatchRequestException,
} from "../../error/sim-sns.error.js";
import { simSnsMaximumPublishBytes } from "../../message/sim-sns-published-message.js";

/**
 * Ten batch entries, named by index.
 */
function entries(count: number): { Id: string; Message: string }[] {
  return Array.from({ length: count }, (_, index) => ({
    Id: `entry-${String(index)}`,
    Message: `order-${String(index)}`,
  }));
}

describe("SNS publish batch", () => {
  it("publishes every entry of a batch", async () => {
    // Given a topic.
    const { simAws, topicArn } = await simAwsWithTopic();

    // When three messages are published at once.
    const published = await simAws.sns().publishBatch(
      new PublishBatchCommand({
        TopicArn: topicArn,
        PublishBatchRequestEntries: entries(3),
      }),
    );

    // Then each is reported under the id it was sent with, with its own id.
    assertArrayEquals(
      published.Successful?.map((entry) => entry.Id),
      ["entry-0", "entry-1", "entry-2"],
    );
    assertArrayLength(published.Failed, 0);

    const messageIds = new Set(
      published.Successful.map((entry) => entry.MessageId),
    );

    assertSetSize(messageIds, 3);
  });

  it("reports one entry's failure without stopping the others", async () => {
    // Given a topic.
    const { simAws, topicArn } = await simAwsWithTopic();

    // When one entry of a batch carries an attribute SNS will not take.
    const published = await simAws.sns().publishBatch(
      new PublishBatchCommand({
        TopicArn: topicArn,
        PublishBatchRequestEntries: [
          { Id: "one", Message: "order-1" },
          {
            Id: "two",
            Message: "order-2",
            MessageAttributes: {
              tenant: { DataType: "Map", StringValue: "acme" },
            },
          },
        ],
      }),
    );

    // Then the rest of the batch goes through and the failure is reported.
    assertArrayEquals(
      published.Successful?.map((entry) => entry.Id),
      ["one"],
    );
    assertArrayLength(published.Failed, 1);
    assertIdentical(published.Failed[0].Id, "two");
    assertIdentical(published.Failed[0].Code, "InvalidParameterValueException");
    assertTrue(published.Failed[0].SenderFault);
  });

  it("refuses an empty batch", async () => {
    // Given a topic.
    const { simAws, topicArn } = await simAwsWithTopic();

    // When a batch with no entries is published.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sns().publishBatch(
        new PublishBatchCommand({
          TopicArn: topicArn,
          PublishBatchRequestEntries: [],
        }),
      );
    });

    // Then the whole request is refused.
    assertInstanceOf(error, SimSnsEmptyBatchRequestException);
  });

  it("refuses more entries than one batch may carry", async () => {
    // Given a topic.
    const { simAws, topicArn } = await simAwsWithTopic();

    // When eleven entries are published at once.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sns().publishBatch(
        new PublishBatchCommand({
          TopicArn: topicArn,
          PublishBatchRequestEntries: entries(11),
        }),
      );
    });

    // Then the whole request is refused.
    assertInstanceOf(error, SimSnsTooManyEntriesInBatchRequestException);
  });

  it("refuses a malformed entry id and a repeated one", async () => {
    // Given a topic.
    const { simAws, topicArn } = await simAwsWithTopic();

    // When an entry id has a space in it, and when two entries share one.
    const malformed = await assertThrowsErrorAsync(async () => {
      await simAws.sns().publishBatch(
        new PublishBatchCommand({
          TopicArn: topicArn,
          PublishBatchRequestEntries: [{ Id: "one two", Message: "order-1" }],
        }),
      );
    });
    const repeated = await assertThrowsErrorAsync(async () => {
      await simAws.sns().publishBatch(
        new PublishBatchCommand({
          TopicArn: topicArn,
          PublishBatchRequestEntries: [
            { Id: "one", Message: "order-1" },
            { Id: "one", Message: "order-2" },
          ],
        }),
      );
    });

    // Then each takes the whole request down rather than one entry.
    assertInstanceOf(malformed, SimSnsInvalidBatchEntryIdException);
    assertInstanceOf(repeated, SimSnsBatchEntryIdsNotDistinctException);
  });

  it("fails the whole batch for one entry over the size limit", async () => {
    // Given a topic and one entry larger than a publish may be.
    const { simAws, topicArn } = await simAwsWithTopic();

    // When it is published alongside an entry that would have gone through.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sns().publishBatch(
        new PublishBatchCommand({
          TopicArn: topicArn,
          PublishBatchRequestEntries: [
            { Id: "one", Message: "order-1" },
            {
              Id: "two",
              Message: "x".repeat(simSnsMaximumPublishBytes + 1),
            },
          ],
        }),
      );
    });

    // Then the batch is refused rather than the entry being reported in
    // Failed: the limit real SNS holds a batch to is the batch's, and one
    // entry over it is already a batch over it.
    assertInstanceOf(error, SimSnsBatchRequestTooLongException);
  });

  it("holds the whole batch to the size limit one publish is held to", async () => {
    // Given a topic and two messages each just inside the limit on its own.
    const { simAws, topicArn } = await simAwsWithTopic();
    const message = "x".repeat(simSnsMaximumPublishBytes - 1);

    // When both are published in one batch.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sns().publishBatch(
        new PublishBatchCommand({
          TopicArn: topicArn,
          PublishBatchRequestEntries: [
            { Id: "one", Message: message },
            { Id: "two", Message: message },
          ],
        }),
      );
    });

    // Then the batch is refused, rather than losing its last entry.
    assertInstanceOf(error, SimSnsBatchRequestTooLongException);
  });
});
