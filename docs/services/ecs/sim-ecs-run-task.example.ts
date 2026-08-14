/**
 * Running a simulated ECS task from a bound container handler.
 */

import {
  CreateClusterCommand,
  DescribeTasksCommand,
  RegisterTaskDefinitionCommand,
  RunTaskCommand,
} from "@aws-sdk/client-ecs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const ecs = simAws.ecs();

await ecs.createCluster(new CreateClusterCommand({ clusterName: "orders" }));

const processed: string[] = [];

ecs.bindContainer({
  family: "orders-worker",
  containerName: "app",
  run: async () => {
    await Promise.resolve();
    processed.push("outstanding orders");
  },
});

await ecs.registerTaskDefinition(
  new RegisterTaskDefinitionCommand({
    family: "orders-worker",
    containerDefinitions: [
      { name: "app", image: "orders-worker:1" },
      { name: "log-router", image: "aws-for-fluent-bit:latest" },
    ],
  }),
);

const run = await ecs.runTask(
  new RunTaskCommand({ cluster: "orders", taskDefinition: "orders-worker" }),
);

console.log(run.tasks?.[0]?.lastStatus); // "PROVISIONING"

// The containers run in the background, as they do on real ECS.
await simAws.backgroundTasksComplete();

console.log(processed); // ["outstanding orders"]

const described = await ecs.describeTasks(
  new DescribeTasksCommand({
    cluster: "orders",
    tasks: [run.tasks?.[0]?.taskArn ?? ""],
  }),
);

console.log(described.tasks?.[0]?.lastStatus); // "STOPPED"
console.log(described.tasks?.[0]?.containers?.[0]?.exitCode); // 0
console.log(described.tasks?.[0]?.containers?.[1]?.reason);
// "Not simulated: no executable binding matches this container, ..."
