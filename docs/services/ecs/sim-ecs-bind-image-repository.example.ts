/**
 * Binding a simulated ECS container by the repository its image comes from.
 */

import {
  CreateClusterCommand,
  RegisterTaskDefinitionCommand,
  RunTaskCommand,
} from "@aws-sdk/client-ecs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const ecs = simAws.ecs();

await ecs.createCluster(new CreateClusterCommand({}));

const started: string[] = [];

ecs.bindContainer({
  imageRepository: "111111111111.dkr.ecr.eu-west-2.amazonaws.com/orders",
  run: () => {
    started.push("app");
  },
});

await ecs.registerTaskDefinition(
  new RegisterTaskDefinitionCommand({
    family: "orders-worker",
    containerDefinitions: [
      {
        name: "app",
        image: "111111111111.dkr.ecr.eu-west-2.amazonaws.com/orders:8f2c1a9b",
      },
    ],
  }),
);

await ecs.runTask(new RunTaskCommand({ taskDefinition: "orders-worker" }));
await simAws.backgroundTasksComplete();

console.log(started); // ["app"]
