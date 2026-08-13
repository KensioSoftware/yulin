/**
 * An event put onto a bus that does not exist is accepted and dropped.
 */

import { PutEventsCommand } from "@aws-sdk/client-eventbridge";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const output = await simAws.eventBridge().putEvents(
  new PutEventsCommand({
    Entries: [
      {
        EventBusName: "odrers", // A typo, and nothing says so.
        Source: "orders.service",
        DetailType: "OrderPlaced",
        Detail: JSON.stringify({ orderId: "order-1" }),
      },
    ],
  }),
);

console.log(output.FailedEntryCount); // 0
console.log(output.Entries?.[0]?.EventId !== undefined); // true
