/**
 * An AWS::ECR::Repository declared by one stack and used by another.
 */

import { InvokeCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

// The platform stack declares the repository.
const platformStack = await simAws.cloudFormation().deployTemplate({
  stackName: "platform",
  template: {
    Resources: {
      OrdersRepository: {
        Type: "AWS::ECR::Repository",
        Properties: { RepositoryName: "orders" },
      },
    },
    Outputs: {
      RepositoryUri: {
        Value: { "Fn::GetAtt": ["OrdersRepository", "RepositoryUri"] },
      },
    },
  },
});

await platformStack.waitForDeployComplete();

const repositoryUri = platformStack.outputs.get("RepositoryUri")?.value;

if (typeof repositoryUri !== "string") {
  throw new TypeError("No RepositoryUri Output");
}

// The handler stands in for whatever the pipeline would have pushed.
simAws
  .ecr()
  .repository("orders")
  .simulateImage({ handler: (): string => "ran the repository image" });

// The application stack runs an image from it.
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
          Code: { ImageUri: `${repositoryUri}:latest` },
        },
      },
    },
  },
});

const output = await simAws
  .lambda()
  .invoke(new InvokeCommand({ FunctionName: "orders" }));

if (output.Payload === undefined) throw new Error("No invoke Payload");
console.log(Buffer.from(output.Payload).toString());

await simAws.backgroundTasksComplete();
