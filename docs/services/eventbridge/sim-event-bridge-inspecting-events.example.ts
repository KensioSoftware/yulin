/**
 * Asserting on the envelope EventBridge built from an entry.
 */

import { PutEventsCommand } from "@aws-sdk/client-eventbridge";

import { SimAws, SimFixedClock } from "@kensio/yulin";

const simAws = new SimAws({
  defaultAccountId: "111111111111",
  defaultRegionName: "eu-west-2",
  clock: new SimFixedClock(new Date("2026-07-26T09:00:00.000Z")),
});

await simAws.eventBridge().putEvents(
  new PutEventsCommand({
    Entries: [
      {
        Source: "orders.service",
        DetailType: "OrderPlaced",
        Detail: JSON.stringify({ orderId: "order-1" }),
        Resources: ["arn:aws:s3:::orders"],
      },
    ],
  }),
);

const [event] = simAws.eventBridge().eventsOn("default");

console.log(event?.toEnvelope());
// {
//   version: "0",
//   id: "0f2c...",
//   "detail-type": "OrderPlaced",
//   source: "orders.service",
//   account: "111111111111",
//   time: "2026-07-26T09:00:00Z",
//   region: "eu-west-2",
//   resources: ["arn:aws:s3:::orders"],
//   detail: { orderId: "order-1" },
// }
