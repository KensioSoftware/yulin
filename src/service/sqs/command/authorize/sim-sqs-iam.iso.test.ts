import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateQueueCommand,
  DeleteMessageBatchCommand,
  ListQueuesCommand,
  ReceiveMessageCommand,
  SendMessageBatchCommand,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";
import {
  assertArrayEquals,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";

const accountId = "111111111111" as SimAwsAccountId;
const regionName = "eu-west-2";

/**
 * A simulated AWS with a queue and a Role whose only permissions are the ones
 * the given policy statement grants.
 */
async function simAwsWithRole(statement: object): Promise<{
  simAws: SimAws;
  queueUrl: string;
  caller: SimAwsCaller;
}> {
  const simAws = new SimAws({
    defaultAccountId: accountId,
    defaultRegionName: regionName,
  });
  const created = await simAws
    .sqs()
    .createQueue(new CreateQueueCommand({ QueueName: "orders" }));

  const role = await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "QueueUser",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: { AWS: `arn:aws:iam::${accountId}:root` },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );

  await simAws.iam().putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "QueueUser",
      PolicyName: "UseQueue",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: statement,
      }),
    }),
  );

  return {
    simAws,
    queueUrl: created.QueueUrl ?? "",
    caller: { kind: "arn", arn: role.Role.Arn },
  };
}

describe("SQS IAM authorization", () => {
  it("allows a queue operation named by the queue ARN", async () => {
    // Given a Role allowed to send to one queue by its ARN, which carries no
    // resource type before the queue name.
    const { simAws, queueUrl, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "sqs:SendMessage",
      Resource: `arn:aws:sqs:${regionName}:${accountId}:orders`,
    });

    // When it sends a message.
    const sent = await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
        { caller },
      );

    // Then the policy allowed it.
    assertNonNullable(sent.MessageId);
  });

  it("denies a queue operation the Role has no permission for", async () => {
    // Given a Role allowed to send but not to receive.
    const { simAws, queueUrl, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "sqs:SendMessage",
      Resource: `arn:aws:sqs:${regionName}:${accountId}:orders`,
    });

    // When it tries to receive.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .sqs()
        .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }), {
          caller,
        });
    });

    // Then it is denied.
    assertIdentical(error.name, "AccessDenied");
    assertStringIncludes(error.message, "sqs:ReceiveMessage");
  });

  it("denies a policy naming the queue ARN with a resource type in it", async () => {
    // Given a Role whose policy names the queue as though SQS ARNs had a
    // resource type, which they do not.
    const { simAws, queueUrl, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "sqs:SendMessage",
      Resource: `arn:aws:sqs:${regionName}:${accountId}:queue/orders`,
    });

    // When it sends a message.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().sendMessage(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: "order-1",
        }),
        { caller },
      );
    });

    // Then the policy reaches nothing, as it reaches nothing on real AWS.
    assertIdentical(error.name, "AccessDenied");
  });

  it("authorizes a batch send as sqs:SendMessage", async () => {
    // Given a Role allowed only to send, since real SQS has no
    // sqs:SendMessageBatch action for a policy to name.
    const { simAws, queueUrl, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "sqs:SendMessage",
      Resource: `arn:aws:sqs:${regionName}:${accountId}:orders`,
    });

    // When it sends a batch.
    const sent = await simAws.sqs().sendMessageBatch(
      new SendMessageBatchCommand({
        QueueUrl: queueUrl,
        Entries: [{ Id: "one", MessageBody: "order-1" }],
      }),
      { caller },
    );

    // Then the singular action allowed it.
    assertArrayEquals(
      sent.Successful?.map((entry) => entry.Id),
      ["one"],
    );
  });

  it("authorizes a batch delete as sqs:DeleteMessage", async () => {
    // Given a Role allowed to send, receive and delete.
    const { simAws, queueUrl, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: ["sqs:SendMessage", "sqs:ReceiveMessage", "sqs:DeleteMessage"],
      Resource: `arn:aws:sqs:${regionName}:${accountId}:orders`,
    });

    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
        { caller },
      );

    const received = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }), {
        caller,
      });

    // When it deletes as a batch.
    const deleted = await simAws.sqs().deleteMessageBatch(
      new DeleteMessageBatchCommand({
        QueueUrl: queueUrl,
        Entries: [
          {
            Id: "one",
            ReceiptHandle: received.Messages?.[0]?.ReceiptHandle,
          },
        ],
      }),
      { caller },
    );

    // Then the singular action allowed it.
    assertArrayEquals(
      deleted.Successful?.map((entry) => entry.Id),
      ["one"],
    );
  });

  it("authorizes listing against every queue in the Account and Region", async () => {
    // Given a Role allowed to list with the resource real SQS documents for it.
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "sqs:ListQueues",
      Resource: `arn:aws:sqs:${regionName}:${accountId}:*`,
    });

    // When it lists the queues.
    const listed = await simAws
      .sqs()
      .listQueues(new ListQueuesCommand({}), { caller });

    // Then the listing is allowed.
    assertIdentical(listed.QueueUrls?.length, 1);
  });

  it("denies listing to a policy naming one queue ARN", async () => {
    // Given a Role allowed to list only the one queue by name, which real SQS
    // gives no queue-level permission for.
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "sqs:ListQueues",
      Resource: `arn:aws:sqs:${regionName}:${accountId}:orders`,
    });

    // When it lists the queues.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().listQueues(new ListQueuesCommand({}), { caller });
    });

    // Then it is denied, as it would be on real AWS.
    assertIdentical(error.name, "AccessDenied");
  });

  it("denies a create the Role has no permission for", async () => {
    // Given a Role allowed to send but not to create queues.
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "sqs:SendMessage",
      Resource: `arn:aws:sqs:${regionName}:${accountId}:*`,
    });

    // When it creates a queue.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .sqs()
        .createQueue(new CreateQueueCommand({ QueueName: "invoices" }), {
          caller,
        });
    });

    // Then it is denied against the ARN the queue would have had.
    assertIdentical(error.name, "AccessDenied");
    assertStringIncludes(error.message, "invoices");
  });

  it("denies an operation on a queue that does not exist", async () => {
    // Given a Role allowed to send to one queue only.
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "sqs:SendMessage",
      Resource: `arn:aws:sqs:${regionName}:${accountId}:orders`,
    });

    // When it sends to a queue that is not there.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().sendMessage(
        new SendMessageCommand({
          QueueUrl: `https://sqs.${regionName}.amazonaws.com/${accountId}/invoices`,
          MessageBody: "order-1",
        }),
        { caller },
      );
    });

    // Then IAM decides first, as real IAM decides before the service looks
    // anything up.
    assertIdentical(error.name, "AccessDenied");
  });
});
