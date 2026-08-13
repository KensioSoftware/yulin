/**
 * Putting an event onto the default event bus.
 */

import { PutEventsCommand } from "@aws-sdk/client-eventbridge";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const events = simAws.eventBridge();

const output = await events.putEvents(
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

console.log(output.FailedEntryCount); // 0
console.log(output.Entries?.[0]?.EventId !== undefined); // true
