import {
  CreateEventBusCommand,
  PutEventsCommand,
  PutPartnerEventsCommand,
  PutRuleCommand,
  PutTargetsCommand,
} from "@aws-sdk/client-eventbridge";
import { AddPermissionCommand } from "@aws-sdk/client-lambda";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../../lambda/index.js";
import {
  SimEventBridgeResourceNotFoundException,
  SimEventBridgeValidationException,
} from "../../error/sim-event-bridge.error.js";

describe("EventBridge partner events", () => {
  const sourceName = "aws.partner/stripe.com/ed_test_billing";

  /**
   * A Stripe event, as the `detail` of the EventBridge event Stripe sends.
   */
  const stripeEvent = {
    id: "evt_test_subscription",
    object: "event",
    type: "customer.subscription.created",
    data: { object: { id: "sub_test", object: "subscription" } },
  };

  /**
   * A simulation where the Account has activated Stripe's source, with a rule
   * on the partner bus sending subscription events to a function.
   */
  async function simAwsWithBillingRule(): Promise<{
    readonly simAws: SimAws;
    readonly received: unknown[];
  }> {
    const simAws = new SimAws();
    const received: unknown[] = [];

    simAws.eventBridge().addPartnerEventSource(sourceName);
    await simAws.eventBridge().createEventBus(
      new CreateEventBusCommand({
        Name: sourceName,
        EventSourceName: sourceName,
      }),
    );

    await simAws.lambda().createFunction({
      input: {
        FunctionName: "billing",
        Role: "arn:aws:iam::888888888888:role/BillingRole",
        Code: {
          ZipFile: makeLambdaZipFileInput((event: unknown) => {
            received.push(event);
            return { ok: true };
          }),
        },
      },
    });

    const rule = await simAws.eventBridge().putRule(
      new PutRuleCommand({
        Name: "subscriptions",
        EventBusName: sourceName,
        EventPattern: JSON.stringify({
          source: [{ prefix: "aws.partner/stripe.com" }],
          "detail-type": ["customer.subscription.created"],
        }),
      }),
    );

    await simAws.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: "billing",
        StatementId: "stripe-events",
        Action: "lambda:InvokeFunction",
        Principal: "events.amazonaws.com",
        SourceArn: rule.RuleArn,
      }),
    );
    await simAws.eventBridge().putTargets(
      new PutTargetsCommand({
        Rule: "subscriptions",
        EventBusName: sourceName,
        Targets: [
          {
            Id: "billing",
            Arn: "arn:aws:lambda:us-east-1:888888888888:function:billing",
          },
        ],
      }),
    );

    return { simAws, received };
  }

  it("delivers a partner event to a rule's target on the partner bus", async () => {
    // Given a rule on Stripe's partner bus targeting a function.
    const { simAws, received } = await simAwsWithBillingRule();

    // When Stripe sends a subscription event.
    const output = await simAws.eventBridge().putPartnerEvents(
      new PutPartnerEventsCommand({
        Entries: [
          {
            Source: sourceName,
            DetailType: "customer.subscription.created",
            Detail: JSON.stringify(stripeEvent),
            Resources: [`arn:aws:events:us-east-1::event-source/${sourceName}`],
          },
        ],
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the function receives the envelope, with Stripe's event as the
    // detail and the receiving Account as the account.
    assertIdentical(output.FailedEntryCount, 0);
    assertArrayLength(received, 1);

    const envelope = received[0] as Record<string, unknown>;

    assertIdentical(envelope["source"], sourceName);
    assertIdentical(envelope["detail-type"], "customer.subscription.created");
    assertIdentical(envelope["account"], "888888888888");
    assertIdentical(envelope["id"], output.Entries?.[0]?.EventId);
    assertObjectEquals(envelope["detail"], stripeEvent);
  });

  it("leaves an event to a rule whose detail-type does not match", async () => {
    // Given a rule on Stripe's partner bus matching subscription events.
    const { simAws, received } = await simAwsWithBillingRule();

    // When Stripe sends a different event type.
    await simAws.eventBridge().putPartnerEvents(
      new PutPartnerEventsCommand({
        Entries: [
          {
            Source: sourceName,
            DetailType: "invoice.paid",
            Detail: JSON.stringify({ ...stripeEvent, type: "invoice.paid" }),
          },
        ],
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the bus took it and the function did not run.
    assertArrayLength(simAws.eventBridge().eventsOn(sourceName), 1);
    assertArrayEmpty(received);
  });

  it("drops an event sent before the Account creates the bus", async () => {
    // Given a source Stripe shared that the Account has not activated.
    const simAws = new SimAws();
    simAws.eventBridge().addPartnerEventSource(sourceName);

    // When Stripe sends an event, and the Account creates the bus after.
    const output = await simAws.eventBridge().putPartnerEvents(
      new PutPartnerEventsCommand({
        Entries: [
          {
            Source: sourceName,
            DetailType: "customer.subscription.created",
            Detail: JSON.stringify(stripeEvent),
          },
        ],
      }),
    );
    await simAws.eventBridge().createEventBus(
      new CreateEventBusCommand({
        Name: sourceName,
        EventSourceName: sourceName,
      }),
    );

    // Then the event went nowhere, as AWS keeps nothing for a pending source.
    assertIdentical(output.FailedEntryCount, 0);
    assertArrayEmpty(simAws.eventBridge().eventsOn(sourceName));
  });

  it("fails an entry missing its detail type in its own place", async () => {
    // Given an active partner bus.
    const { simAws } = await simAwsWithBillingRule();

    // When Stripe sends one good entry and one with no DetailType.
    const output = await simAws.eventBridge().putPartnerEvents(
      new PutPartnerEventsCommand({
        Entries: [
          { Source: sourceName, Detail: JSON.stringify(stripeEvent) },
          {
            Source: sourceName,
            DetailType: "customer.subscription.created",
            Detail: JSON.stringify(stripeEvent),
          },
        ],
      }),
    );

    // Then only the first fails, and the second reaches the bus.
    assertIdentical(output.FailedEntryCount, 1);
    assertIdentical(output.Entries?.[0]?.ErrorCode, "InvalidArgument");
    assertArrayLength(simAws.eventBridge().eventsOn(sourceName), 1);
  });

  it("refuses events from a source nobody shared", async () => {
    // Given an Account with no partner event source.
    const simAws = new SimAws();

    // When events are sent from an unknown source.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.eventBridge().putPartnerEvents(
        new PutPartnerEventsCommand({
          Entries: [
            {
              Source: sourceName,
              DetailType: "customer.subscription.created",
              Detail: "{}",
            },
          ],
        }),
      );
    });

    // Then the whole request is refused, naming the source.
    assertInstanceOf(error, SimEventBridgeResourceNotFoundException);
    assertStringIncludes(error.message, sourceName);
  });

  it("refuses a request with no entries, too many, or too many bytes", async () => {
    // Given an active partner bus.
    const { simAws } = await simAwsWithBillingRule();
    const entry = {
      Source: sourceName,
      DetailType: "customer.subscription.created",
      Detail: "{}",
    };

    // When requests outside the PutPartnerEvents limits are sent.
    const requests = [
      { Entries: [] },
      { Entries: Array.from({ length: 21 }, () => entry) },
      {
        Entries: [
          { ...entry, Detail: JSON.stringify({ a: "x".repeat(1_100_000) }) },
        ],
      },
    ];

    // Then each is refused outright.
    for (const input of requests) {
      // oxlint-disable-next-line no-await-in-loop
      const error = await assertThrowsErrorAsync(async () => {
        await simAws
          .eventBridge()
          .putPartnerEvents(new PutPartnerEventsCommand(input));
      });

      assertInstanceOf(error, SimEventBridgeValidationException);
    }
  });

  it("refuses PutEvents onto a partner bus", async () => {
    // Given an active partner bus.
    const { simAws } = await simAwsWithBillingRule();

    // When the Account puts an event onto it itself.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.eventBridge().putEvents(
        new PutEventsCommand({
          Entries: [
            {
              EventBusName: sourceName,
              Source: sourceName,
              DetailType: "customer.subscription.created",
              Detail: "{}",
            },
          ],
        }),
      );
    });

    // Then it is refused, since only the partner sends to its bus.
    assertInstanceOf(error, SimEventBridgeValidationException);
    assertStringIncludes(error.message, "partner");
  });
});
