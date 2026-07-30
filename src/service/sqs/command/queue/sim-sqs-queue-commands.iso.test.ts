import {
  CreateQueueCommand,
  DeleteQueueCommand,
  GetQueueUrlCommand,
  ListQueuesCommand,
} from "@aws-sdk/client-sqs";
import {
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import {
  SimSqsInvalidParameterValue,
  SimSqsQueueDeletedRecently,
  SimSqsQueueDoesNotExist,
  SimSqsQueueNameExists,
  SimSqsUnsupportedOperation,
  SimSqsValidationException,
} from "../../error/sim-sqs.error.js";

describe("SQS queue commands", () => {
  it("creates a queue with a URL and ARN naming its Account and Region", async () => {
    // Given a simulated AWS in one Account and Region.
    const simAws = new SimAws({
      defaultAccountId: "111111111111" as SimAwsAccountId,
      defaultRegionName: "eu-west-2",
    });

    // When a queue is created.
    const created = await simAws
      .sqs()
      .createQueue(new CreateQueueCommand({ QueueName: "orders" }));

    // Then the URL is the one real SQS would give it.
    assertIdentical(
      created.QueueUrl,
      "https://sqs.eu-west-2.amazonaws.com/111111111111/orders",
    );

    // And the ARN carries the name with no resource type in front of it.
    const queue = simAws.sqs().findQueue("orders");

    assertNonNullable(queue);
    assertIdentical(
      queue.arn.value,
      "arn:aws:sqs:eu-west-2:111111111111:orders",
    );
  });

  it("answers a repeated create with the existing queue URL", async () => {
    // Given an existing queue with a visibility timeout.
    const simAws = new SimAws();
    const created = await simAws.sqs().createQueue(
      new CreateQueueCommand({
        QueueName: "orders",
        Attributes: { VisibilityTimeout: "60" },
      }),
    );

    // When it is created again with the same attributes, and with none.
    const again = await simAws.sqs().createQueue(
      new CreateQueueCommand({
        QueueName: "orders",
        Attributes: { VisibilityTimeout: "60" },
      }),
    );
    const withoutAttributes = await simAws
      .sqs()
      .createQueue(new CreateQueueCommand({ QueueName: "orders" }));

    // Then both answer with the queue that is already there.
    assertIdentical(again.QueueUrl, created.QueueUrl);
    assertIdentical(withoutAttributes.QueueUrl, created.QueueUrl);
  });

  it("refuses a repeated create whose attributes differ", async () => {
    // Given an existing queue with a visibility timeout.
    const simAws = new SimAws();
    await simAws.sqs().createQueue(
      new CreateQueueCommand({
        QueueName: "orders",
        Attributes: { VisibilityTimeout: "60" },
      }),
    );

    // When it is created again with a different one.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().createQueue(
        new CreateQueueCommand({
          QueueName: "orders",
          Attributes: { VisibilityTimeout: "30" },
        }),
      );
    });

    // Then the name is reported as taken, as real SQS reports it.
    assertInstanceOf(error, SimSqsQueueNameExists);
  });

  it("holds a deleted queue name until simulated time moves on", async () => {
    // Given a queue that has just been deleted.
    const simAws = new SimAws();
    const created = await simAws
      .sqs()
      .createQueue(new CreateQueueCommand({ QueueName: "orders" }));
    await simAws
      .sqs()
      .deleteQueue(new DeleteQueueCommand({ QueueUrl: created.QueueUrl }));

    // When the name is used again straight away.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .sqs()
        .createQueue(new CreateQueueCommand({ QueueName: "orders" }));
    });

    // Then it is still held, as real SQS holds it for a minute.
    assertInstanceOf(error, SimSqsQueueDeletedRecently);

    // And advancing the clock past the minute frees it.
    await simAws.clock().advanceBy({ seconds: 61 });

    const recreated = await simAws
      .sqs()
      .createQueue(new CreateQueueCommand({ QueueName: "orders" }));

    assertIdentical(recreated.QueueUrl, created.QueueUrl);
  });

  it("gets the URL of a queue by name", async () => {
    // Given an existing queue.
    const simAws = new SimAws();
    const created = await simAws
      .sqs()
      .createQueue(new CreateQueueCommand({ QueueName: "orders" }));

    // When its URL is asked for by name.
    const found = await simAws
      .sqs()
      .getQueueUrl(new GetQueueUrlCommand({ QueueName: "orders" }));

    // Then it is the URL the queue was created with.
    assertIdentical(found.QueueUrl, created.QueueUrl);
  });

  it("refuses to find a queue that does not exist", async () => {
    // Given a simulated AWS with no queues.
    const simAws = new SimAws();

    // When an unknown name is looked up.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .sqs()
        .getQueueUrl(new GetQueueUrlCommand({ QueueName: "orders" }));
    });

    // Then it is reported the way real SQS reports it.
    assertInstanceOf(error, SimSqsQueueDoesNotExist);
  });

  it("refuses a request for a queue owned by another Account", async () => {
    // Given an existing queue.
    const simAws = new SimAws({
      defaultAccountId: "111111111111" as SimAwsAccountId,
    });
    await simAws
      .sqs()
      .createQueue(new CreateQueueCommand({ QueueName: "orders" }));

    // When it is asked for as another Account's queue.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().getQueueUrl(
        new GetQueueUrlCommand({
          QueueName: "orders",
          QueueOwnerAWSAccountId: "222222222222",
        }),
      );
    });

    // Then it is refused, since cross-account access is not simulated.
    assertInstanceOf(error, SimSqsUnsupportedOperation);
  });

  it("lists queues by name prefix, a page at a time", async () => {
    // Given three queues, two of them sharing a prefix.
    const simAws = new SimAws();
    for (const name of ["orders-new", "orders-done", "invoices"]) {
      // eslint-disable-next-line no-await-in-loop
      await simAws
        .sqs()
        .createQueue(new CreateQueueCommand({ QueueName: name }));
    }

    // When they are listed by prefix, one at a time.
    const first = await simAws
      .sqs()
      .listQueues(
        new ListQueuesCommand({ QueueNamePrefix: "orders", MaxResults: 1 }),
      );
    const second = await simAws.sqs().listQueues(
      new ListQueuesCommand({
        QueueNamePrefix: "orders",
        MaxResults: 1,
        NextToken: first.NextToken,
      }),
    );

    // Then each page carries one matching queue, in creation order.
    assertArrayEquals(
      first.QueueUrls?.map((url) => queueName(url)),
      ["orders-new"],
    );
    assertArrayEquals(
      second.QueueUrls?.map((url) => queueName(url)),
      ["orders-done"],
    );
    assertUndefined(second.NextToken);
  });

  it("lists every queue when no prefix is given", async () => {
    // Given two queues.
    const simAws = new SimAws();
    await simAws
      .sqs()
      .createQueue(new CreateQueueCommand({ QueueName: "orders" }));
    await simAws
      .sqs()
      .createQueue(new CreateQueueCommand({ QueueName: "invoices" }));

    // When they are listed.
    const listed = await simAws.sqs().listQueues(new ListQueuesCommand({}));

    // Then both are there.
    assertArrayEquals(
      listed.QueueUrls?.map((url) => queueName(url)),
      ["orders", "invoices"],
    );
    assertUndefined(listed.NextToken);
  });

  it("refuses a listing page size outside the range real SQS accepts", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a listing asks for more results than SQS allows.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .sqs()
        .listQueues(new ListQueuesCommand({ MaxResults: 1001 }));
    });

    // Then it is refused.
    assertInstanceOf(error, SimSqsInvalidParameterValue);
  });

  it("refuses a continuation token it did not issue", async () => {
    // Given a queue to list.
    const simAws = new SimAws();
    await simAws
      .sqs()
      .createQueue(new CreateQueueCommand({ QueueName: "orders" }));

    // When a made-up token is passed.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .sqs()
        .listQueues(new ListQueuesCommand({ NextToken: "not-a-token" }));
    });

    // Then it is refused rather than answered from the beginning.
    assertInstanceOf(error, SimSqsInvalidParameterValue);
  });

  it("deletes a queue", async () => {
    // Given an existing queue.
    const simAws = new SimAws();
    const created = await simAws
      .sqs()
      .createQueue(new CreateQueueCommand({ QueueName: "orders" }));

    // When it is deleted.
    await simAws
      .sqs()
      .deleteQueue(new DeleteQueueCommand({ QueueUrl: created.QueueUrl }));

    // Then it is gone.
    assertUndefined(simAws.sqs().findQueue("orders"));
  });

  it("refuses a FIFO queue name", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a FIFO queue is asked for.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .sqs()
        .createQueue(new CreateQueueCommand({ QueueName: "orders.fifo" }));
    });

    // Then it is refused rather than created as a standard queue.
    assertInstanceOf(error, SimSqsUnsupportedOperation);
    assertStringIncludes(error.message, "FIFO");
  });

  it("refuses a queue name real SQS would refuse", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a name with a disallowed character is used.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .sqs()
        .createQueue(new CreateQueueCommand({ QueueName: "orders queue" }));
    });

    // Then it is refused.
    assertInstanceOf(error, SimSqsInvalidParameterValue);
  });

  it("refuses a create with no queue name", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a queue is created with no name.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().createQueue({ input: {} });
    });

    // Then the missing input is reported.
    assertInstanceOf(error, SimSqsValidationException);
  });

  it("refuses queue tags rather than dropping them", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a queue is created with tags.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().createQueue(
        new CreateQueueCommand({
          QueueName: "orders",
          tags: { Team: "payments" },
        }),
      );
    });

    // Then it is refused, since tags are not simulated.
    assertInstanceOf(error, SimSqsUnsupportedOperation);
  });

  it("refuses a get with no queue name", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a URL is asked for with no name.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().getQueueUrl({ input: {} });
    });

    // Then the missing input is reported.
    assertInstanceOf(error, SimSqsValidationException);
  });
});

/**
 * The queue name at the end of a queue URL.
 */
function queueName(queueUrl: string): string {
  return queueUrl.split("/").pop() ?? "";
}
