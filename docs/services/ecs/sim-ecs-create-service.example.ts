/**
 * Creating a simulated ECS service that keeps three tasks running.
 */

import {
  CreateClusterCommand,
  CreateServiceCommand,
  DescribeServicesCommand,
  ListTasksCommand,
  RegisterTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const ecs = simAws.ecs();

await ecs.createCluster(new CreateClusterCommand({ clusterName: "orders" }));

ecs.bindContainer({
  family: "checkout",
  containerName: "app",
  run: async () => {
    await handleOneRequest();
  },
});

await ecs.registerTaskDefinition(
  new RegisterTaskDefinitionCommand({
    family: "checkout",
    containerDefinitions: [{ name: "app", image: "checkout:1" }],
  }),
);

const created = await ecs.createService(
  new CreateServiceCommand({
    cluster: "orders",
    serviceName: "checkout",
    taskDefinition: "checkout",
    desiredCount: 3,
  }),
);

console.log(created.service?.desiredCount); // 3
console.log(created.service?.runningCount); // 0, as real ECS answers one

// The tasks come up in the background, as they do on real ECS.
await simAws.backgroundTasksComplete();

const described = await ecs.describeServices(
  new DescribeServicesCommand({ cluster: "orders", services: ["checkout"] }),
);

console.log(described.services?.[0]?.runningCount); // 3

const listed = await ecs.listTasks(
  new ListTasksCommand({ cluster: "orders", serviceName: "checkout" }),
);

console.log(listed.taskArns?.length); // 3

async function handleOneRequest(): Promise<void> {
  await Promise.resolve();
}
