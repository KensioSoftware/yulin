/**
 * Simulating a container image Lambda function with a bound handler.
 */

import { InvokeCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";

const imageFunctionTemplate = {
  Resources: {
    OrdersFunction: {
      Type: "AWS::Lambda::Function",
      Properties: {
        FunctionName: "orders",
        Role: "arn:aws:iam::111111111111:role/OrdersRole",
        PackageType: "Image",
        Code: {
          ImageUri:
            "111111111111.dkr.ecr.eu-west-2.amazonaws.com/orders:latest",
        },
      },
    },
  },
};

// Without a binding, the function is skipped and the stack still deploys.
const skippedSimAws = new SimAws();

const skippedStack = await skippedSimAws.cloudFormation().deployTemplate({
  stackName: "orders-stack",
  template: imageFunctionTemplate,
});

console.log(skippedStack.getResource("OrdersFunction")?.skippedReason);

await skippedSimAws.backgroundTasksComplete();

// With a binding, the handler replaces the image and the function runs.
const simAws = new SimAws();

await simAws.cloudFormation().deployTemplate({
  stackName: "orders-stack",
  template: imageFunctionTemplate,
  bindings: [
    {
      logicalId: "OrdersFunction",
      handler: (event: { orderId: string }): string =>
        `Processed ${event.orderId}`,
    },
  ],
});

const output = await simAws.lambda().invoke(
  new InvokeCommand({
    FunctionName: "orders",
    Payload: JSON.stringify({ orderId: "order-1" }),
  }),
);

if (output.Payload === undefined) throw new Error("No invoke Payload");
console.log(Buffer.from(output.Payload).toString());

await simAws.backgroundTasksComplete();
