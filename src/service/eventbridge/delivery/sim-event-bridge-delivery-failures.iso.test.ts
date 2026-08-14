import {
  PutEventsCommand,
  PutRuleCommand,
  PutTargetsCommand,
} from "@aws-sdk/client-eventbridge";
import { CreateTopicCommand, SubscribeCommand } from "@aws-sdk/client-sns";
import {
  CreateQueueCommand,
  ReceiveMessageCommand,
  SetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { SimEventBridge } from "../sim-event-bridge.js";
import { makeLambdaZipFileInput } from "../../lambda/index.js";

const orderPattern = JSON.stringify({ source: ["orders.service"] });

/**
 * A policy admitting one service principal to one resource for one action.
 */
function policyAdmittingEvents(action: string, resource: string): string {
  return JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Service: "events.amazonaws.com" },
        Action: action,
        Resource: resource,
      },
    ],
  });
}

/**
 * A rule with one target, and one order event put through it.
 */
async function deliverOrderTo(
  simAws: SimAws,
  target: { readonly Id: string; readonly Arn: string },
): Promise<void> {
  await simAws
    .eventBridge()
    .putRule(
      new PutRuleCommand({ Name: "orders", EventPattern: orderPattern }),
    );
  await simAws
    .eventBridge()
    .putTargets(new PutTargetsCommand({ Rule: "orders", Targets: [target] }));
  await simAws.eventBridge().putEvents(
    new PutEventsCommand({
      Entries: [
        {
          Source: "orders.service",
          DetailType: "OrderPlaced",
          Detail: "{}",
        },
      ],
    }),
  );

  await simAws.backgroundTasksComplete();
}

describe("EventBridge delivery to topics and its failures", () => {
  it("publishes a matched event to a topic target, which fans out", async () => {
    // Given a topic admitting EventBridge, with a queue subscribed to it.
    const simAws = new SimAws();
    const topicArn = "arn:aws:sns:us-east-1:888888888888:orders";
    const queueArn = "arn:aws:sqs:us-east-1:888888888888:inbox";

    await simAws.sns().createTopic(
      new CreateTopicCommand({
        Name: "orders",
        Attributes: { Policy: policyAdmittingEvents("sns:Publish", topicArn) },
      }),
    );

    const queue = await simAws
      .sqs()
      .createQueue(new CreateQueueCommand({ QueueName: "inbox" }));

    await simAws.sqs().setQueueAttributes(
      new SetQueueAttributesCommand({
        QueueUrl: queue.QueueUrl,
        Attributes: {
          Policy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: { Service: "sns.amazonaws.com" },
                Action: "sqs:SendMessage",
                Resource: queueArn,
              },
            ],
          }),
        },
      }),
    );

    await simAws.sns().subscribe(
      new SubscribeCommand({
        TopicArn: topicArn,
        Protocol: "sqs",
        Endpoint: queueArn,
      }),
    );

    // When a matching event is put.
    await deliverOrderTo(simAws, { Id: "topic", Arn: topicArn });

    // Then the subscribed queue got the event inside SNS's own envelope.
    const received = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queue.QueueUrl }));

    assertArrayLength(received.Messages ?? [], 1);

    const envelope = JSON.parse(String(received.Messages?.[0]?.Body)) as {
      Message: string;
    };
    const event = JSON.parse(envelope.Message) as { source: string };

    assertIdentical(event.source, "orders.service");
  });

  it("records a topic target whose policy refuses EventBridge", async () => {
    // Given a topic with no policy admitting EventBridge.
    const simAws = new SimAws();

    await simAws.sns().createTopic(new CreateTopicCommand({ Name: "orders" }));

    // When a matching event is put.
    await deliverOrderTo(simAws, {
      Id: "topic",
      Arn: "arn:aws:sns:us-east-1:888888888888:orders",
    });

    // Then the refusal is recorded, naming what to grant.
    const [failure] = simAws.eventBridge().deliveryFailures;

    assertNonNullable(failure);
    assertStringIncludes(failure.message, "sns:Publish");
  });

  it("records a topic target that names nothing", async () => {
    // Given a rule targeting a topic that was never created.
    const simAws = new SimAws();

    await deliverOrderTo(simAws, {
      Id: "topic",
      Arn: "arn:aws:sns:us-east-1:888888888888:nowhere",
    });

    const [failure] = simAws.eventBridge().deliveryFailures;

    assertNonNullable(failure);
    assertStringIncludes(failure.message, "is not a simulated SNS topic");
  });

  it("records a Lambda target that names nothing, and one that refuses", async () => {
    // Given a function with no permission for EventBridge, and a name that is
    // not a function at all.
    const simAws = new SimAws();

    await simAws.lambda().createFunction({
      input: {
        FunctionName: "fulfilment",
        Role: "arn:aws:iam::888888888888:role/FulfilmentRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => ({ ok: true })) },
      },
    });

    await simAws
      .eventBridge()
      .putRule(
        new PutRuleCommand({ Name: "orders", EventPattern: orderPattern }),
      );
    await simAws.eventBridge().putTargets(
      new PutTargetsCommand({
        Rule: "orders",
        Targets: [
          {
            Id: "unpermitted",
            Arn: "arn:aws:lambda:us-east-1:888888888888:function:fulfilment",
          },
          {
            Id: "missing",
            Arn: "arn:aws:lambda:us-east-1:888888888888:function:nowhere",
          },
        ],
      }),
    );

    await simAws.eventBridge().putEvents(
      new PutEventsCommand({
        Entries: [
          { Source: "orders.service", DetailType: "OrderPlaced", Detail: "{}" },
        ],
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then both are recorded, and each says which kind of problem it was.
    const failures = simAws.eventBridge().deliveryFailures;

    assertArrayLength(failures, 2);
    const [unpermitted, missing] = failures;

    assertNonNullable(unpermitted);
    assertNonNullable(missing);
    assertStringIncludes(unpermitted.message, "AddPermission");
    assertStringIncludes(missing.message, "is not a simulated Lambda function");
  });

  it("records that a standalone simulated EventBridge has nowhere to deliver", async () => {
    // Given an EventBridge built on its own rather than through SimAws.
    const simEventBridge = new SimEventBridge();

    await simEventBridge.putRule(
      new PutRuleCommand({ Name: "orders", EventPattern: orderPattern }),
    );
    await simEventBridge.putTargets(
      new PutTargetsCommand({
        Rule: "orders",
        Targets: [
          { Id: "queue", Arn: "arn:aws:sqs:us-east-1:888888888888:orders" },
        ],
      }),
    );

    // When a matching event is put.
    await simEventBridge.putEvents(
      new PutEventsCommand({
        Entries: [
          { Source: "orders.service", DetailType: "OrderPlaced", Detail: "{}" },
        ],
      }),
    );

    // Then the delivery is recorded as having nowhere to go, rather than
    // quietly looking delivered.
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    const [failure] = simEventBridge.deliveryFailures;

    assertNonNullable(failure);
    assertStringIncludes(failure.message, "no targets to deliver to");
  });
});
