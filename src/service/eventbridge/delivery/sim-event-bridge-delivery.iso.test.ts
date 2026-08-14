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
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertObjectEquals,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../lambda/index.js";

const orderPattern = JSON.stringify({ source: ["orders.service"] });

/**
 * A queue whose policy admits EventBridge for every rule of the Account.
 */
async function queueAdmittingEvents(simAws: SimAws): Promise<string> {
  const created = await simAws
    .sqs()
    .createQueue(new CreateQueueCommand({ QueueName: "orders" }));

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
              Resource: "arn:aws:sqs:us-east-1:888888888888:orders",
            },
          ],
        }),
      },
    }),
  );

  return String(created.QueueUrl);
}

/**
 * A rule matching order events, with one target.
 */
async function ruleWithTarget(
  simAws: SimAws,
  target: {
    readonly Id: string;
    readonly Arn: string;
    readonly Input?: string;
  },
): Promise<void> {
  await simAws
    .eventBridge()
    .putRule(
      new PutRuleCommand({ Name: "orders", EventPattern: orderPattern }),
    );

  await simAws
    .eventBridge()
    .putTargets(new PutTargetsCommand({ Rule: "orders", Targets: [target] }));
}

/**
 * Put one order event and wait for the deliveries it caused.
 */
async function putOrder(simAws: SimAws): Promise<void> {
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

describe("EventBridge target delivery", () => {
  it("sends a matched event to a queue target", async () => {
    // Given a rule targeting a queue that admits EventBridge.
    const simAws = new SimAws();
    const queueUrl = await queueAdmittingEvents(simAws);

    await ruleWithTarget(simAws, {
      Id: "orders-queue",
      Arn: "arn:aws:sqs:us-east-1:888888888888:orders",
    });

    // When a matching event is put.
    await putOrder(simAws);

    // Then the queue received the event itself, with no envelope around it.
    const received = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

    assertArrayLength(received.Messages ?? [], 1);

    const body: unknown = JSON.parse(String(received.Messages?.[0]?.Body));

    assertObjectEquals(body, {
      version: "0",
      id: (body as { id: string }).id,
      "detail-type": "OrderPlaced",
      source: "orders.service",
      account: "888888888888",
      time: (body as { time: string }).time,
      region: "us-east-1",
      resources: [],
      detail: { orderId: "order-1" },
    });
  });

  it("invokes a Lambda target that admits EventBridge", async () => {
    // Given a rule targeting a function with an events.amazonaws.com grant.
    const simAws = new SimAws();
    const received: unknown[] = [];

    await simAws.lambda().createFunction({
      input: {
        FunctionName: "fulfilment",
        Role: "arn:aws:iam::888888888888:role/FulfilmentRole",
        Code: {
          ZipFile: makeLambdaZipFileInput((event: unknown) => {
            received.push(event);
            return { ok: true };
          }),
        },
      },
    });

    await simAws.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: "fulfilment",
        StatementId: "events",
        Action: "lambda:InvokeFunction",
        Principal: "events.amazonaws.com",
      }),
    );

    await ruleWithTarget(simAws, {
      Id: "fulfilment",
      Arn: "arn:aws:lambda:us-east-1:888888888888:function:fulfilment",
    });

    // When a matching event is put.
    await putOrder(simAws);

    // Then the handler ran with the event.
    assertArrayLength(received, 1);
    assertIdentical(
      (received[0] as { source: string } | undefined)?.source,
      "orders.service",
    );
  });

  it("sends a target its fixed input instead of the event", async () => {
    // Given a target with an Input of its own.
    const simAws = new SimAws();
    const queueUrl = await queueAdmittingEvents(simAws);

    await ruleWithTarget(simAws, {
      Id: "orders-queue",
      Arn: "arn:aws:sqs:us-east-1:888888888888:orders",
      Input: JSON.stringify({ wake: "up" }),
    });

    // When a matching event is put.
    await putOrder(simAws);

    // Then the target received the input as written, not the event.
    const received = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

    assertIdentical(received.Messages?.[0]?.Body, '{"wake":"up"}');
  });

  it("hands a Lambda target its fixed input as a parsed value", async () => {
    // Given a function target with an Input of its own.
    const simAws = new SimAws();
    const received: unknown[] = [];

    await simAws.lambda().createFunction({
      input: {
        FunctionName: "fulfilment",
        Role: "arn:aws:iam::888888888888:role/FulfilmentRole",
        Code: {
          ZipFile: makeLambdaZipFileInput((event: unknown) => {
            received.push(event);
            return { ok: true };
          }),
        },
      },
    });
    await simAws.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: "fulfilment",
        StatementId: "events",
        Action: "lambda:InvokeFunction",
        Principal: "events.amazonaws.com",
      }),
    );

    await ruleWithTarget(simAws, {
      Id: "fulfilment",
      Arn: "arn:aws:lambda:us-east-1:888888888888:function:fulfilment",
      Input: JSON.stringify({ wake: "up" }),
    });

    // When a matching event is put.
    await putOrder(simAws);

    // Then the handler was given the input, parsed, rather than the event.
    assertObjectEquals(received[0], { wake: "up" });
  });

  it("sends nothing when the event matches no rule", async () => {
    // Given a rule wanting a different source.
    const simAws = new SimAws();
    const queueUrl = await queueAdmittingEvents(simAws);

    await simAws.eventBridge().putRule(
      new PutRuleCommand({
        Name: "billing",
        EventPattern: JSON.stringify({ source: ["billing.service"] }),
      }),
    );
    await simAws.eventBridge().putTargets(
      new PutTargetsCommand({
        Rule: "billing",
        Targets: [
          { Id: "q", Arn: "arn:aws:sqs:us-east-1:888888888888:orders" },
        ],
      }),
    );

    // When an order event is put.
    await putOrder(simAws);

    // Then the queue is empty.
    const received = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

    assertArrayLength(received.Messages ?? [], 0);
  });

  it("records a delivery a target's policy refused, and tells the caller nothing", async () => {
    // Given a rule targeting a queue whose policy says nothing about
    // EventBridge.
    const simAws = new SimAws();

    await simAws
      .sqs()
      .createQueue(new CreateQueueCommand({ QueueName: "orders" }));

    await ruleWithTarget(simAws, {
      Id: "orders-queue",
      Arn: "arn:aws:sqs:us-east-1:888888888888:orders",
    });

    // When a matching event is put.
    await putOrder(simAws);

    // Then the put succeeded and the failure is readable here instead.
    const [failure] = simAws.eventBridge().deliveryFailures;

    assertNonNullable(failure);
    assertIdentical(failure.ruleName, "orders");
    assertIdentical(failure.targetId, "orders-queue");
    assertStringIncludes(failure.message, "does not allow");
    assertStringIncludes(failure.message, "events.amazonaws.com");
  });

  it("records a target that names nothing", async () => {
    // Given a rule targeting a queue that was never created.
    const simAws = new SimAws();

    await ruleWithTarget(simAws, {
      Id: "missing",
      Arn: "arn:aws:sqs:us-east-1:888888888888:nowhere",
    });

    // When a matching event is put.
    await putOrder(simAws);

    // Then the failure says the target is not there, which reads differently
    // from a policy refusing the delivery.
    const [failure] = simAws.eventBridge().deliveryFailures;

    assertNonNullable(failure);
    assertStringIncludes(failure.message, "is not a simulated SQS queue");
  });

  it("sends one event to every target of every rule that matched it", async () => {
    // Given two rules matching the same event, each with a target.
    const simAws = new SimAws();
    const queueUrl = await queueAdmittingEvents(simAws);

    await simAws
      .eventBridge()
      .putRule(
        new PutRuleCommand({ Name: "orders", EventPattern: orderPattern }),
      );
    await simAws.eventBridge().putRule(
      new PutRuleCommand({
        Name: "everything",
        EventPattern: JSON.stringify({ version: ["0"] }),
      }),
    );

    for (const rule of ["orders", "everything"]) {
      // oxlint-disable-next-line no-await-in-loop
      await simAws.eventBridge().putTargets(
        new PutTargetsCommand({
          Rule: rule,
          Targets: [
            { Id: "q", Arn: "arn:aws:sqs:us-east-1:888888888888:orders" },
          ],
        }),
      );
    }

    // When one matching event is put.
    await putOrder(simAws);

    // Then the queue has it twice, once for each rule.
    const received = await simAws.sqs().receiveMessage(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 10,
      }),
    );

    assertArrayLength(received.Messages ?? [], 2);
  });
});
