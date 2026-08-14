/**
 * Simulated ECS state in two account and region scopes.
 */

import {
  ListTaskDefinitionsCommand,
  RegisterTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const registered = await simAws
  .account("222222222222")
  .region("us-east-1")
  .ecs()
  .registerTaskDefinition(
    new RegisterTaskDefinitionCommand({
      family: "checkout",
      containerDefinitions: [{ name: "app", image: "checkout:1" }],
    }),
  );

console.log(registered.taskDefinition?.taskDefinitionArn);
// "arn:aws:ecs:us-east-1:222222222222:task-definition/checkout:1"

const elsewhere = await simAws
  .account("222222222222")
  .region("eu-west-2")
  .ecs()
  .listTaskDefinitions(new ListTaskDefinitionsCommand({}));

console.log(elsewhere.taskDefinitionArns?.length); // 0
