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

const accountId = "111111111111";
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

  it("allows listing to a policy whose resource is a bare wildcard", async () => {
    // Given a Role allowed to list queues the only way real SQS allows it.
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "sqs:ListQueues",
      Resource: "*",
    });

    // When it lists the queues.
    const listed = await simAws
      .sqs()
      .listQueues(new ListQueuesCommand({}), { caller });

    // Then the listing is allowed.
    assertIdentical(listed.QueueUrls?.length, 1);
  });

  it("gives listing no queue-level permission", async () => {
    // Given Roles allowed to list queues by naming one queue ARN, and by
    // naming every queue ARN in the Account and Region.
    const oneQueue = await simAwsWithRole({
      Effect: "Allow",
      Action: "sqs:ListQueues",
      Resource: `arn:aws:sqs:${regionName}:${accountId}:orders`,
    });
    const everyQueue = await simAwsWithRole({
      Effect: "Allow",
      Action: "sqs:ListQueues",
      Resource: `arn:aws:sqs:${regionName}:${accountId}:*`,
    });

    // When each lists the queues.
    const refusals = await Promise.all(
      [oneQueue, everyQueue].map(async ({ simAws, caller }) =>
        assertThrowsErrorAsync(async () => {
          await simAws.sqs().listQueues(new ListQueuesCommand({}), { caller });
        }),
      ),
    );

    // Then neither allows it. Real SQS gives ListQueues no resource type at
    // all, so it is authorized against `*` and only a policy naming `*`
    // reaches it.
    for (const error of refusals) {
      assertIdentical(error.name, "AccessDenied");
      assertStringIncludes(error.message, "resource: *");
    }
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

    // Then it is denied rather than told the queue is missing. Finding the
    // queue comes first now that its policy is part of the decision, and a
    // queue that is not there contributes no policy to admit anyone.
    assertIdentical(error.name, "AccessDenied");
  });
});
