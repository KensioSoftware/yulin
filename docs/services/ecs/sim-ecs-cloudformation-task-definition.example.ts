/**
 * Deploying an ECS stack and binding a handler to one of its containers.
 */

import { RunTaskCommand } from "@aws-sdk/client-ecs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const processedOrders: string[] = [];

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "orders",
  template: {
    Resources: {
      OrdersCluster: {
        Type: "AWS::ECS::Cluster",
        Properties: { ClusterName: "orders" },
      },
      WorkerTaskDefinition: {
        Type: "AWS::ECS::TaskDefinition",
        Properties: {
          Family: "orders-worker",
          Cpu: "512",
          Memory: "1024",
          NetworkMode: "awsvpc",
          RequiresCompatibilities: ["FARGATE"],
          ContainerDefinitions: [
            {
              Name: "app",
              Image: "example.dkr.ecr.eu-west-2.amazonaws.com/orders-worker:1",
              Essential: true,
              Environment: [{ Name: "LOG_LEVEL", Value: "debug" }],
            },
          ],
        },
      },
    },
    Outputs: {
      TaskDefinition: { Value: { Ref: "WorkerTaskDefinition" } },
    },
  },
  bindings: [
    {
      family: "orders-worker",
      containerName: "app",
      run: async (): Promise<void> => {
        await Promise.resolve();
        processedOrders.push("outstanding orders");
      },
    },
  ],
});

await stack.waitForDeployComplete();

console.log(stack.outputs.get("TaskDefinition")?.value);
// "arn:aws:ecs:us-east-1:888888888888:task-definition/orders-worker:1"

// Running a task from the deployed task definition runs the bound handler.
await simAws
  .ecs()
  .runTask(
    new RunTaskCommand({ cluster: "orders", taskDefinition: "orders-worker" }),
  );

await simAws.backgroundTasksComplete();

console.log(processedOrders); // ["outstanding orders"]
