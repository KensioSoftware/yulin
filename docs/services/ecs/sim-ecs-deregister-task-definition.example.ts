/**
 * Deregistering a simulated task definition revision.
 */

import {
  DeregisterTaskDefinitionCommand,
  DescribeTaskDefinitionCommand,
  RegisterTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const ecs = simAws.ecs();

for (const tag of ["checkout:1", "checkout:2"]) {
  await ecs.registerTaskDefinition(
    new RegisterTaskDefinitionCommand({
      family: "checkout",
      containerDefinitions: [{ name: "app", image: tag }],
    }),
  );
}

await ecs.deregisterTaskDefinition(
  new DeregisterTaskDefinitionCommand({ taskDefinition: "checkout:2" }),
);

const deregistered = await ecs.describeTaskDefinition(
  new DescribeTaskDefinitionCommand({ taskDefinition: "checkout:2" }),
);

console.log(deregistered.taskDefinition?.status); // "INACTIVE"

const latest = await ecs.describeTaskDefinition(
  new DescribeTaskDefinitionCommand({ taskDefinition: "checkout" }),
);

console.log(latest.taskDefinition?.revision); // 1
