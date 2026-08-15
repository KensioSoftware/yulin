/**
 * Scaling a simulated ECS service and moving it to a new revision.
 */

import {
  CreateClusterCommand,
  CreateServiceCommand,
  ListTasksCommand,
  RegisterTaskDefinitionCommand,
  UpdateServiceCommand,
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
    desiredCount: 1,
  }),
);

const scaled = await ecs.updateService(
  new UpdateServiceCommand({
    cluster: "orders",
    service: "checkout",
    desiredCount: 4,
  }),
);

console.log(scaled.service?.desiredCount); // 4

const second = await ecs.registerTaskDefinition(
  new RegisterTaskDefinitionCommand({
    family: "checkout",
    containerDefinitions: [{ name: "app", image: "checkout:2" }],
  }),
);

const deployed = await ecs.updateService(
  new UpdateServiceCommand({
    cluster: "orders",
    service: "checkout",
    taskDefinition: "checkout:2",
  }),
);

console.log(
  deployed.service?.taskDefinition === second.taskDefinition?.taskDefinitionArn,
); // true

await simAws.backgroundTasksComplete();

const listed = await ecs.listTasks(
  new ListTasksCommand({ cluster: "orders", serviceName: "checkout" }),
);

console.log(listed.taskArns?.length); // 4, all of them on the new revision
