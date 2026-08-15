/**
 * Deploying an ECS service and reading what it is keeping running.
 */

import { ListTasksCommand } from "@aws-sdk/client-ecs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

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
          ContainerDefinitions: [
            {
              Name: "app",
              Image: "example.dkr.ecr.eu-west-2.amazonaws.com/orders-worker:1",
            },
          ],
        },
      },
      WorkerService: {
        Type: "AWS::ECS::Service",
        Properties: {
          ServiceName: "orders-worker",
          Cluster: { Ref: "OrdersCluster" },
          TaskDefinition: { Ref: "WorkerTaskDefinition" },
          DesiredCount: 2,
          LaunchType: "FARGATE",
        },
      },
    },
    Outputs: {
      Service: { Value: { Ref: "WorkerService" } },
      ServiceName: { Value: { "Fn::GetAtt": ["WorkerService", "Name"] } },
    },
  },
  bindings: [
    {
      logicalId: "WorkerTaskDefinition",
      run: (): void => {
        // Whatever the worker container does when something reaches it.
      },
    },
  ],
});

await stack.waitForDeployComplete();
await simAws.backgroundTasksComplete();

console.log(stack.outputs.get("Service")?.value);
// "arn:aws:ecs:us-east-1:888888888888:service/orders/orders-worker"
console.log(stack.outputs.get("ServiceName")?.value); // "orders-worker"

const service = simAws.ecs().service("orders-worker", "orders");

console.log(service.desiredCount); // 2

const listed = await simAws
  .ecs()
  .listTasks(
    new ListTasksCommand({ cluster: "orders", serviceName: "orders-worker" }),
  );

console.log(listed.taskArns?.length); // 2
