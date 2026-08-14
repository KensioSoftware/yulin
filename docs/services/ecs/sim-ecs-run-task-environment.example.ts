/**
 * The environment variables a simulated ECS container runs with.
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

const batchSizes: (string | undefined)[] = [];

ecs.bindContainer({
  family: "orders-worker",
  containerName: "app",
  run: () => {
    batchSizes.push(process.env["BATCH_SIZE"]);
  },
});

await ecs.registerTaskDefinition(
  new RegisterTaskDefinitionCommand({
    family: "orders-worker",
    containerDefinitions: [
      {
        name: "app",
        image: "orders-worker:1",
        environment: [{ name: "BATCH_SIZE", value: "100" }],
      },
    ],
  }),
);

await ecs.runTask(
  new RunTaskCommand({
    taskDefinition: "orders-worker",
    overrides: {
      containerOverrides: [
        { name: "app", environment: [{ name: "BATCH_SIZE", value: "10" }] },
      ],
    },
  }),
);
await simAws.backgroundTasksComplete();

console.log(batchSizes); // ["10"]
