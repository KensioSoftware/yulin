/**
 * Checking a pattern against an event before writing a rule with it.
 */

import { TestEventPatternCommand } from "@aws-sdk/client-eventbridge";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const { Result } = await simAws.eventBridge().testEventPattern(
  new TestEventPatternCommand({
    EventPattern: JSON.stringify({
      detail: { total: [{ numeric: [">=", 1000] }] },
    }),
    Event: JSON.stringify({
      source: "orders.service",
      "detail-type": "OrderPlaced",
      detail: { orderId: "order-1", total: 4200 },
    }),
  }),
);

console.log(Result); // true
