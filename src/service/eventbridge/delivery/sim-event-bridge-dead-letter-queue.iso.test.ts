import {
  PutEventsCommand,
  PutRuleCommand,
  PutTargetsCommand,
} from "@aws-sdk/client-eventbridge";
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
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { BackgroundTasks } from "../../../util/background/background.js";
import { SimClockControl } from "../../../util/clock/sim-clock-control.js";
import { SimControllableClock } from "../../../util/clock/sim-controllable-clock.js";
import { SimFixedClock } from "../../../util/clock/sim-clock.js";
import { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../lambda/index.js";
import { SimEventBridge } from "../sim-event-bridge.js";

describe("EventBridge target dead-letter queues", () => {
  const dlqArn = "arn:aws:sqs:us-east-1:888888888888:undelivered-orders";
  const functionArn =
    "arn:aws:lambda:us-east-1:888888888888:function:fulfilment";

  /**
   * A dead-letter queue, admitting EventBridge for the `orders` rule when
   * asked to.
   */
  async function deadLetterQueue(
    simAws: SimAws,
    admitsEvents: boolean,
  ): Promise<string> {
    const created = await simAws
      .sqs()
      .createQueue(new CreateQueueCommand({ QueueName: "undelivered-orders" }));

    if (admitsEvents) {
      await simAws.sqs().setQueueAttributes(
        new SetQueueAttributesCommand({
          QueueUrl: created.QueueUrl,
          Attributes: {
            Policy: JSON.stringify({
              Version: "2012-10-17",
              Statement: [
                {
                  Effect: "Allow",
                  Principal: { Service: "events.amazonaws.com" },
                  Action: "sqs:SendMessage",
                  Resource: dlqArn,
                  Condition: {
                    ArnEquals: {
                      "aws:SourceArn":
                        "arn:aws:events:us-east-1:888888888888:rule/orders",
                    },
                  },
                },
              ],
            }),
          },
        }),
      );
    }

    return String(created.QueueUrl);
  }

  /**
   * A rule whose function target never granted EventBridge permission to
   * invoke it, with a dead-letter queue, and one event put through it.
   */
  async function putOrderToUnpermittedFunction(simAws: SimAws): Promise<void> {
    await simAws.lambda().createFunction({
      input: {
        FunctionName: "fulfilment",
        Role: "arn:aws:iam::888888888888:role/FulfilmentRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => ({ ok: true })) },
      },
    });
    await simAws.eventBridge().putRule(
      new PutRuleCommand({
        Name: "orders",
        EventPattern: JSON.stringify({ source: ["orders.service"] }),
      }),
    );
    await simAws.eventBridge().putTargets(
      new PutTargetsCommand({
        Rule: "orders",
        Targets: [
          {
            Id: "fulfilment",
            Arn: functionArn,
            DeadLetterConfig: { Arn: dlqArn },
            RetryPolicy: { MaximumRetryAttempts: 3 },
          },
        ],
      }),
    );
    await simAws.eventBridge().putEvents(
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

  it("sends a refused event to the dead-letter queue with its reasons", async () => {
    // Given a dead-letter queue admitting EventBridge for the rule.
    const simAws = new SimAws();
    const queueUrl = await deadLetterQueue(simAws, true);

    // When an event matches a rule whose function refuses EventBridge.
    await putOrderToUnpermittedFunction(simAws);

    // Then the event is on the queue, saying which rule and target gave up and
    // why, with no retry made for a refusal.
    const received = await simAws.sqs().receiveMessage(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MessageAttributeNames: ["All"],
      }),
    );
    const message = received.Messages?.[0];

    assertNonNullable(message);

    const attributes = message.MessageAttributes ?? {};
    const body = JSON.parse(message.Body) as Record<string, unknown>;

    assertIdentical(body["detail-type"], "OrderPlaced");
    assertIdentical(
      attributes["RULE_ARN"]?.StringValue,
      "arn:aws:events:us-east-1:888888888888:rule/orders",
    );
    assertIdentical(attributes["TARGET_ARN"]?.StringValue, functionArn);
    assertIdentical(attributes["ERROR_CODE"]?.StringValue, "NO_PERMISSIONS");
    assertStringIncludes(
      String(attributes["ERROR_MESSAGE"]?.StringValue),
      "fulfilment",
    );
    assertIdentical(attributes["RETRY_ATTEMPTS"]?.StringValue, "0");
    assertUndefined(attributes["EXHAUSTED_RETRY_CONDITION"]);
    assertArrayEmpty(simAws.eventBridge().deliveryFailures);
  });

  it("records the failure when the dead-letter queue does not admit EventBridge", async () => {
    // Given a dead-letter queue with no policy.
    const simAws = new SimAws();
    await deadLetterQueue(simAws, false);

    // When an event matches a rule whose function refuses EventBridge.
    await putOrderToUnpermittedFunction(simAws);

    // Then the queue's refusal is the recorded failure.
    const failures = simAws.eventBridge().deliveryFailures;

    assertArrayLength(failures, 1);
    assertStringIncludes(failures[0].message, dlqArn);
  });

  it("records a dead letter a standalone EventBridge has nowhere to send", async () => {
    // Given an EventBridge built outside SimAws, with a dead-letter queue.
    const clock = new SimControllableClock({
      base: new SimFixedClock(new Date("2026-10-07T09:00:00.000Z")),
    });
    const background = new BackgroundTasks({ clock });
    const eventBridge = new SimEventBridge({ background });

    await eventBridge.putRule(
      new PutRuleCommand({
        Name: "orders",
        EventPattern: JSON.stringify({ source: ["orders.service"] }),
      }),
    );
    await eventBridge.putTargets(
      new PutTargetsCommand({
        Rule: "orders",
        Targets: [
          {
            Id: "fulfilment",
            Arn: functionArn,
            DeadLetterConfig: { Arn: dlqArn },
          },
        ],
      }),
    );

    // When an event matches the rule.
    await eventBridge.putEvents(
      new PutEventsCommand({
        Entries: [
          { Source: "orders.service", DetailType: "OrderPlaced", Detail: "{}" },
        ],
      }),
    );
    await new SimClockControl({ clock, background }).advanceBy({
      milliseconds: 0,
    });

    // Then the failure says there was no queue to reach.
    assertStringIncludes(
      eventBridge.deliveryFailures[0]?.message ?? "",
      "no queues",
    );
  });
});
