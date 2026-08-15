/**
 * Binding a container by the task definition Resource and by its repository.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "orders",
  template: {
    Resources: {
      WorkerTaskDefinition: {
        Type: "AWS::ECS::TaskDefinition",
        Metadata: { "aws:cdk:path": "OrdersStack/WorkerTask/Resource" },
        Properties: {
          Family: "orders-worker",
          ContainerDefinitions: [
            {
              Name: "app",
              Image: "example.dkr.ecr.eu-west-2.amazonaws.com/orders-worker:1",
            },
            {
              Name: "log-router",
              Image: "public.ecr.aws/aws-observability/aws-for-fluent-bit:1",
            },
          ],
        },
      },
      CheckoutTaskDefinition: {
        Type: "AWS::ECS::TaskDefinition",
        Properties: {
          Family: "orders-checkout",
          ContainerDefinitions: [
            {
              Name: "app",
              Image: "example.dkr.ecr.eu-west-2.amazonaws.com/checkout:9f21c0",
            },
          ],
        },
      },
    },
  },
  bindings: [
    // The CDK construct ID, naming the container because this task definition
    // declares more than one.
    {
      logicalId: "WorkerTask",
      containerName: "app",
      run: (): void => {
        // Whatever the worker does.
      },
    },
    // Any container running an image from this repository, whatever its tag.
    {
      imageRepository: "example.dkr.ecr.eu-west-2.amazonaws.com/checkout",
      run: (): void => {
        // Whatever the checkout container does.
      },
    },
  ],
});

await stack.waitForDeployComplete();

console.log(simAws.ecs().taskDefinition("orders-worker").revision); // 1
