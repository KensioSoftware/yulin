/**
 * Binding a handler to a container image function by its image repository.
 */

import { InvokeCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws.cloudFormation().deployTemplate({
  stackName: "orders-stack",
  template: {
    Parameters: {
      ImageTag: { Type: "String" },
    },
    Resources: {
      OrdersFunction: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: "orders",
          Role: "arn:aws:iam::111111111111:role/OrdersRole",
          PackageType: "Image",
          Code: {
            ImageUri: {
              "Fn::Sub":
                // eslint-disable-next-line no-template-curly-in-string
                "${AWS::AccountId}.dkr.ecr.${AWS::Region}.amazonaws.com/orders:${ImageTag}",
            },
          },
        },
      },
    },
  },
  parameters: { ImageTag: "build-4172" },
  bindings: [
    {
      imageRepository:
        `${simAws.defaultAccountId}.dkr.ecr.` +
        `${simAws.defaultRegionName}.amazonaws.com/orders`,
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
