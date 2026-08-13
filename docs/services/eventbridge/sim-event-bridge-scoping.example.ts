/**
 * Event buses in two Regions of the same Account.
 */

import { CreateEventBusCommand } from "@aws-sdk/client-eventbridge";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws
  .account("111111111111")
  .region("eu-west-2")
  .eventBridge()
  .createEventBus(new CreateEventBusCommand({ Name: "orders" }));

const elsewhere = simAws.account("111111111111").region("us-east-1");

console.log(elsewhere.eventBridge().findEventBus("orders")); // undefined
