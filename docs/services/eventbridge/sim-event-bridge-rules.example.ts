/**
 * A rule matching order events on a bus.
 */

import { PutEventsCommand, PutRuleCommand } from "@aws-sdk/client-eventbridge";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const events = simAws.eventBridge();

await events.putRule(
  new PutRuleCommand({
    Name: "large-orders",
    EventPattern: JSON.stringify({
      source: ["orders.service"],
      "detail-type": ["OrderPlaced"],
      detail: { total: [{ numeric: [">=", 1000] }] },
    }),
  }),
);

await events.putEvents(
  new PutEventsCommand({
    Entries: [
      {
        Source: "orders.service",
        DetailType: "OrderPlaced",
        Detail: JSON.stringify({ orderId: "order-1", total: 4200 }),
      },
    ],
  }),
);

const [receipt] = events.receiptsOn("default");

console.log(receipt?.matchedRuleNames); // ["large-orders"]
