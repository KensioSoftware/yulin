/**
 * Registering a handler as the image in a simulated ECR repository.
 */

import { InvokeCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

simAws
  .ecr()
  .repository("orders")
  .simulateImage({
    imageTag: "latest",
    handler: (event: { orderId: string }): string =>
      `Processed ${event.orderId}`,
  });

// Any stack whose function image points into that repository runs the handler.
await simAws.cloudFormation().deployTemplate({
  stackName: "orders-api",
  template: {
    Resources: {
      OrdersFunction: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: "orders",
          Role: `arn:aws:iam::${simAws.defaultAccountId}:role/OrdersRole`,
          PackageType: "Image",
          Code: {
            ImageUri:
              `${simAws.defaultAccountId}.dkr.ecr.` +
              `${simAws.defaultRegionName}.amazonaws.com/orders:2f0e1dab4c`,
          },
        },
      },
    },
  },
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
