/**
 * Registering a second revision of a simulated task definition family.
 */

import {
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

const latest = await ecs.describeTaskDefinition(
  new DescribeTaskDefinitionCommand({ taskDefinition: "checkout" }),
);

console.log(latest.taskDefinition?.revision); // 2

const first = await ecs.describeTaskDefinition(
  new DescribeTaskDefinitionCommand({ taskDefinition: "checkout:1" }),
);

console.log(first.taskDefinition?.containerDefinitions?.[0]?.image);
// "checkout:1"
