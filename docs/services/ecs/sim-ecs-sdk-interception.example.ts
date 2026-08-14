/**
 * Reaching simulated ECS through an intercepted ECS SDK client.
 */

import {
  DescribeTaskDefinitionCommand,
  ECSClient,
  RegisterTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";

import { SimSdk } from "@kensio/yulin/sdk";

using simSdk = new SimSdk();
simSdk.intercept(ECSClient);

const ecs = new ECSClient({ region: "eu-west-2" });

await ecs.send(
  new RegisterTaskDefinitionCommand({
    family: "checkout",
    containerDefinitions: [{ name: "app", image: "checkout:1" }],
  }),
);

const described = await ecs.send(
  new DescribeTaskDefinitionCommand({ taskDefinition: "checkout" }),
);

console.log(described.taskDefinition?.revision); // 1
