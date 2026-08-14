/**
 * Registering a simulated task definition and reading it back.
 */

import {
  DescribeTaskDefinitionCommand,
  RegisterTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const ecs = simAws.ecs();

await ecs.registerTaskDefinition(
  new RegisterTaskDefinitionCommand({
    family: "checkout",
    cpu: "512",
    memory: "1024",
    networkMode: "awsvpc",
    requiresCompatibilities: ["FARGATE"],
    containerDefinitions: [
      {
        name: "app",
        image: "example.dkr.ecr.eu-west-2.amazonaws.com/checkout:1",
        essential: true,
        portMappings: [{ containerPort: 8080, protocol: "tcp" }],
        environment: [{ name: "LOG_LEVEL", value: "debug" }],
      },
    ],
  }),
);

const described = await ecs.describeTaskDefinition(
  new DescribeTaskDefinitionCommand({ taskDefinition: "checkout" }),
);

console.log(described.taskDefinition?.revision); // 1
console.log(described.taskDefinition?.status); // "ACTIVE"
console.log(described.taskDefinition?.containerDefinitions?.[0]?.image);
// "example.dkr.ecr.eu-west-2.amazonaws.com/checkout:1"
