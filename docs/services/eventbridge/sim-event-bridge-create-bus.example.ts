/**
 * Creating a custom event bus and putting an event onto it.
 */

import {
  CreateEventBusCommand,
  DescribeEventBusCommand,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const events = simAws.eventBridge();

const created = await events.createEventBus(
  new CreateEventBusCommand({ Name: "orders" }),
);

console.log(created.EventBusArn);
// "arn:aws:events:us-east-1:888888888888:event-bus/orders"

await events.putEvents(
  new PutEventsCommand({
    Entries: [
      {
        EventBusName: "orders",
        Source: "orders.service",
        DetailType: "OrderPlaced",
        Detail: JSON.stringify({ orderId: "order-1" }),
      },
    ],
  }),
);

const described = await events.describeEventBus(
  new DescribeEventBusCommand({ Name: "orders" }),
);

console.log(described.Name); // "orders"
