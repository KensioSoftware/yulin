/**
 * Listing simulated task definition revisions and families.
 */

import {
  ListTaskDefinitionFamiliesCommand,
  ListTaskDefinitionsCommand,
  RegisterTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const ecs = simAws.ecs();

for (const family of ["checkout", "billing"]) {
  await ecs.registerTaskDefinition(
    new RegisterTaskDefinitionCommand({
      family,
      containerDefinitions: [{ name: "app", image: `${family}:1` }],
    }),
  );
}

const revisions = await ecs.listTaskDefinitions(
  new ListTaskDefinitionsCommand({ familyPrefix: "check" }),
);

console.log(revisions.taskDefinitionArns?.length); // 1

const families = await ecs.listTaskDefinitionFamilies(
  new ListTaskDefinitionFamiliesCommand({}),
);

console.log(families.families); // ["checkout", "billing"]
