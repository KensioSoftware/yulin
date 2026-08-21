/**
 * Naming the bindings a deployment takes, for a list built somewhere else.
 */

import { InvokeCommand } from "@aws-sdk/client-lambda";
import { SimAws } from "@kensio/yulin";
import type { SimCfnBinding } from "@kensio/yulin/cloudformation";

const orders: string[] = [];

const bindings: readonly SimCfnBinding[] = [
  {
    logicalId: "PlaceOrderFunction",
    handler: (event: { item: string }): void => {
      orders.push(event.item);
    },
  },
];

const simAws = new SimAws();

await simAws.cloudFormation().deployTemplate({
  stackName: "orders-stack",
  template: {
    Resources: {
      PlaceOrderFunction: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: "place-order",
          Role: "arn:aws:iam::111111111111:role/PlaceOrderRole",
        },
      },
    },
  },
  bindings,
});

await simAws.lambda().invoke(
  new InvokeCommand({
    FunctionName: "place-order",
    Payload: JSON.stringify({ item: "sourdough" }),
  }),
);

console.log(orders);
