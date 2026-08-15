/**
 * Deleting a simulated ECS service and the tasks it was keeping running.
 */

import {
  CreateClusterCommand,
  CreateServiceCommand,
  DeleteServiceCommand,
  DescribeServicesCommand,
  ListTasksCommand,
  RegisterTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const ecs = simAws.ecs();

await ecs.createCluster(new CreateClusterCommand({ clusterName: "orders" }));
await ecs.registerTaskDefinition(
  new RegisterTaskDefinitionCommand({
    family: "checkout",
    containerDefinitions: [{ name: "app", image: "checkout:1" }],
  }),
);
await ecs.createService(
  new CreateServiceCommand({
    cluster: "orders",
    serviceName: "checkout",
    taskDefinition: "checkout",
    desiredCount: 2,
  }),
);
await simAws.backgroundTasksComplete();

const deleted = await ecs.deleteService(
  new DeleteServiceCommand({
    cluster: "orders",
    service: "checkout",
    force: true,
  }),
);

console.log(deleted.service?.status); // "INACTIVE"

const listed = await ecs.listTasks(
  new ListTasksCommand({ cluster: "orders", serviceName: "checkout" }),
);

console.log(listed.taskArns?.length); // 0

const described = await ecs.describeServices(
  new DescribeServicesCommand({ cluster: "orders", services: ["checkout"] }),
);

console.log(described.services?.[0]?.runningCount); // 0
