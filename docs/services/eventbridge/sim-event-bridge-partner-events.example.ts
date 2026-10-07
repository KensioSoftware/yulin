/**
 * Receiving Stripe's events on a partner event bus.
 */

import {
  CreateEventBusCommand,
  PutPartnerEventsCommand,
  PutRuleCommand,
} from "@aws-sdk/client-eventbridge";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const events = simAws.eventBridge();
const source = "aws.partner/stripe.com/ed_test_billing";

// What Stripe does when an event destination is set up for the account.
events.addPartnerEventSource(source);

// What the account does to receive from it.
await events.createEventBus(
  new CreateEventBusCommand({ Name: source, EventSourceName: source }),
);
await events.putRule(
  new PutRuleCommand({
    Name: "subscriptions",
    EventBusName: source,
    EventPattern: JSON.stringify({
      source: [{ prefix: "aws.partner/stripe.com" }],
      "detail-type": ["customer.subscription.created"],
    }),
  }),
);

// What Stripe sends when a subscription starts.
await events.putPartnerEvents(
  new PutPartnerEventsCommand({
    Entries: [
      {
        Source: source,
        DetailType: "customer.subscription.created",
        Detail: JSON.stringify({
          id: "evt_test_subscription",
          type: "customer.subscription.created",
          data: { object: { id: "sub_test" } },
        }),
      },
    ],
  }),
);

console.log(events.receiptsOn(source)[0]?.matchedRuleNames); // ["subscriptions"]
