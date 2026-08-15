/**
 * Two tagged images in one simulated ECR repository.
 */

import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const registryHost =
  `${simAws.defaultAccountId}.dkr.ecr.` +
  `${simAws.defaultRegionName}.amazonaws.com`;

simAws
  .ecr()
  .repository("orders")
  .simulateImage({ imageTag: "blue", handler: (): string => "blue handler" })
  .simulateImage({ imageTag: "green", handler: (): string => "green handler" });

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "orders-blue",
    Role: `arn:aws:iam::${simAws.defaultAccountId}:role/OrdersRole`,
    PackageType: "Image",
    Code: { ImageUri: `${registryHost}/orders:blue` },
  }),
);

const output = await simAws
  .lambda()
  .invoke(new InvokeCommand({ FunctionName: "orders-blue" }));

if (output.Payload === undefined) throw new Error("No invoke Payload");
console.log(Buffer.from(output.Payload).toString()); // "blue handler"

await simAws.backgroundTasksComplete();
