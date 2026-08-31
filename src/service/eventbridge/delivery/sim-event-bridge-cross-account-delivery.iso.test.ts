import {
  PutEventsCommand,
  PutRuleCommand,
  PutTargetsCommand,
} from "@aws-sdk/client-eventbridge";
import { AddPermissionCommand } from "@aws-sdk/client-lambda";
import {
  CreateQueueCommand,
  ReceiveMessageCommand,
  SetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../lambda/index.js";

const ruleAccount = "111111111111";

const targetAccount = "222222222222";

const orderPattern = JSON.stringify({ source: ["orders.service"] });

/**
 * The ARN the rule below has, which a target's policy is conditioned on.
 */
const ruleArn = `arn:aws:events:us-east-1:${ruleAccount}:rule/orders`;

/**
 * A policy admitting EventBridge to one resource, for one rule.
 */
function policyForRule(
  action: string,
  resource: string,
  sourceArn = ruleArn,
): string {
  return JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Service: "events.amazonaws.com" },
        Action: action,
        Resource: resource,
        Condition: { ArnLike: { "aws:SourceArn": sourceArn } },
      },
    ],
  });
}

/**
 * Put an order event through a rule in the rule Account, with one target.
 */
async function deliverAcross(
  simAws: SimAws,
  target: { readonly Id: string; readonly Arn: string },
): Promise<void> {
  const events = simAws.account(ruleAccount).region("us-east-1").eventBridge();

  await events.putRule(
    new PutRuleCommand({ Name: "orders", EventPattern: orderPattern }),
  );
  await events.putTargets(
    new PutTargetsCommand({ Rule: "orders", Targets: [target] }),
  );
  await events.putEvents(
    new PutEventsCommand({
      Entries: [
        {
          Source: "orders.service",
          DetailType: "OrderPlaced",
          Detail: JSON.stringify({ orderId: "order-1" }),
        },
      ],
    }),
  );

  await simAws.backgroundTasksComplete();
}

describe("EventBridge delivery across Accounts and Regions", () => {
  it("sends an event to a queue in another Account that admits the rule", async () => {
    // Given a queue in a second Account, whose policy admits EventBridge for
    // the first Account's rule.
    const simAws = new SimAws();
    const queueArn = `arn:aws:sqs:us-east-1:${targetAccount}:orders`;
    const targetSqs = simAws.account(targetAccount).region("us-east-1").sqs();

    const queue = await targetSqs.createQueue(
      new CreateQueueCommand({ QueueName: "orders" }),
    );

    await targetSqs.setQueueAttributes(
      new SetQueueAttributesCommand({
        QueueUrl: queue.QueueUrl,
        Attributes: { Policy: policyForRule("sqs:SendMessage", queueArn) },
      }),
    );

    // When a rule in the first Account targets it.
    await deliverAcross(simAws, { Id: "orders-queue", Arn: queueArn });

    // Then the queue in the other Account received the event.
    const received = await targetSqs.receiveMessage(
      new ReceiveMessageCommand({ QueueUrl: queue.QueueUrl }),
    );

    assertArrayLength(received.Messages ?? [], 1);

    const event = JSON.parse(String(received.Messages?.[0]?.Body)) as {
      account: string;
    };

    // And the event still names the Account it was put in, not the target's.
    assertIdentical(event.account, ruleAccount);
  });

  it("refuses a queue in another Account whose policy does not name the rule", async () => {
    // Given a queue in a second Account admitting a different rule.
    const simAws = new SimAws();
    const queueArn = `arn:aws:sqs:us-east-1:${targetAccount}:orders`;
    const targetSqs = simAws.account(targetAccount).region("us-east-1").sqs();

    const queue = await targetSqs.createQueue(
      new CreateQueueCommand({ QueueName: "orders" }),
    );

    await targetSqs.setQueueAttributes(
      new SetQueueAttributesCommand({
        QueueUrl: queue.QueueUrl,
        Attributes: {
          Policy: policyForRule(
            "sqs:SendMessage",
            queueArn,
            `arn:aws:events:us-east-1:${ruleAccount}:rule/something-else`,
          ),
        },
      }),
    );

    // When the orders rule targets it.
    await deliverAcross(simAws, { Id: "orders-queue", Arn: queueArn });

    // Then the delivery is refused, because the condition names another rule.
    const [failure] = simAws
      .account(ruleAccount)
      .region("us-east-1")
      .eventBridge().deliveryFailures;

    const received = await targetSqs.receiveMessage(
      new ReceiveMessageCommand({ QueueUrl: queue.QueueUrl }),
    );

    assertNonNullable(failure);
    assertStringIncludes(failure.message, "does not allow");
    assertArrayEmpty(received.Messages ?? []);
  });

  it("invokes a function in another Account that granted the rule", async () => {
    // Given a function in a second Account with an AddPermission grant.
    const simAws = new SimAws();
    const received: unknown[] = [];
    const targetLambda = simAws
      .account(targetAccount)
      .region("us-east-1")
      .lambda();

    await targetLambda.createFunction({
      input: {
        FunctionName: "fulfilment",
        Role: `arn:aws:iam::${targetAccount}:role/FulfilmentRole`,
        Code: {
          ZipFile: makeLambdaZipFileInput((event: unknown) => {
            received.push(event);
            return { ok: true };
          }),
        },
      },
    });

    await targetLambda.addPermission(
      new AddPermissionCommand({
        FunctionName: "fulfilment",
        StatementId: "events",
        Action: "lambda:InvokeFunction",
        Principal: "events.amazonaws.com",
        SourceArn: ruleArn,
      }),
    );

    // When a rule in the first Account targets it.
    await deliverAcross(simAws, {
      Id: "fulfilment",
      Arn: `arn:aws:lambda:us-east-1:${targetAccount}:function:fulfilment`,
    });

    // Then the function in the other Account ran.
    assertArrayLength(received, 1);
  });

  it("sends an event to a queue in another Region of the same Account", async () => {
    // Given a queue in another Region.
    const simAws = new SimAws();
    const queueArn = `arn:aws:sqs:eu-west-2:${ruleAccount}:orders`;
    const targetSqs = simAws.account(ruleAccount).region("eu-west-2").sqs();

    const queue = await targetSqs.createQueue(
      new CreateQueueCommand({ QueueName: "orders" }),
    );

    await targetSqs.setQueueAttributes(
      new SetQueueAttributesCommand({
        QueueUrl: queue.QueueUrl,
        Attributes: { Policy: policyForRule("sqs:SendMessage", queueArn) },
      }),
    );

    // When a rule in us-east-1 targets it.
    await deliverAcross(simAws, { Id: "orders-queue", Arn: queueArn });

    // Then the queue in the other Region received the event.
    const received = await targetSqs.receiveMessage(
      new ReceiveMessageCommand({ QueueUrl: queue.QueueUrl }),
    );

    assertArrayLength(received.Messages ?? [], 1);
  });

  it("admits a rule by the Account it belongs to", async () => {
    // Given a queue admitting EventBridge for any rule of the first Account,
    // which is the other condition AWS pairs with the source ARN.
    const simAws = new SimAws();
    const queueArn = `arn:aws:sqs:us-east-1:${targetAccount}:orders`;
    const targetSqs = simAws.account(targetAccount).region("us-east-1").sqs();

    const queue = await targetSqs.createQueue(
      new CreateQueueCommand({ QueueName: "orders" }),
    );

    await targetSqs.setQueueAttributes(
      new SetQueueAttributesCommand({
        QueueUrl: queue.QueueUrl,
        Attributes: {
          Policy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: { Service: "events.amazonaws.com" },
                Action: "sqs:SendMessage",
                Resource: queueArn,
                Condition: {
                  StringEquals: { "aws:SourceAccount": ruleAccount },
                },
              },
            ],
          }),
        },
      }),
    );

    // When a rule in that Account targets it.
    await deliverAcross(simAws, { Id: "orders-queue", Arn: queueArn });

    // Then the delivery is admitted by the Account condition alone.
    const received = await targetSqs.receiveMessage(
      new ReceiveMessageCommand({ QueueUrl: queue.QueueUrl }),
    );

    assertArrayLength(received.Messages ?? [], 1);
  });
});
