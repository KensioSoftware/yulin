/**
 * Passing a cache URL to a simulated ECS container.
 */

import {
  CreateClusterCommand,
  RegisterTaskDefinitionCommand,
  RunTaskCommand,
} from "@aws-sdk/client-ecs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const ecs = simAws.ecs();
const connections: string[] = [];

await ecs.createCluster(new CreateClusterCommand({}));

ecs.bindContainer({
  family: "rates-worker",
  containerName: "app",
  run: () => {
    connections.push(process.env["CACHE_URL"] ?? "");
  },
});

await ecs.registerTaskDefinition(
  new RegisterTaskDefinitionCommand({
    family: "rates-worker",
    containerDefinitions: [
      {
        name: "app",
        image: "rates-worker:1",
        environment: [{ name: "CACHE_URL", value: "redis://127.0.0.1:6379" }],
      },
    ],
  }),
);

await ecs.runTask(new RunTaskCommand({ taskDefinition: "rates-worker" }));
await simAws.backgroundTasksComplete();

console.log(connections); // ["redis://127.0.0.1:6379"]
