/**
 * Authorizing what a simulated ECS container does as the task Role.
 */

import {
  CreateClusterCommand,
  RegisterTaskDefinitionCommand,
  RunTaskCommand,
} from "@aws-sdk/client-ecs";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { PutParameterCommand, SSMClient } from "@aws-sdk/client-ssm";

import { SimSdk } from "@kensio/yulin/sdk";

using simSdk = new SimSdk();
const { simAws } = simSdk;
const ecs = simAws.ecs();
const accountId = simAws.defaultAccountId;

const taskRole = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "OrdersTaskRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { Service: "ecs-tasks.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "OrdersTaskRole",
    PolicyName: "WriteLastRun",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "ssm:PutParameter",
        Resource: `arn:aws:ssm:${simAws.defaultRegionName}:${accountId}:parameter/orders/last-run`,
      },
    }),
  }),
);

await ecs.createCluster(new CreateClusterCommand({}));

simSdk.intercept(SSMClient);

ecs.bindContainer({
  family: "orders-worker",
  containerName: "app",
  run: async () => {
    await new SSMClient({}).send(
      new PutParameterCommand({
        Name: "/orders/last-run",
        Value: "done",
        Type: "String",
      }),
    );
  },
});

await ecs.registerTaskDefinition(
  new RegisterTaskDefinitionCommand({
    family: "orders-worker",
    taskRoleArn: taskRole.Role.Arn,
    containerDefinitions: [{ name: "app", image: "orders-worker:1" }],
  }),
);

await ecs.runTask(new RunTaskCommand({ taskDefinition: "orders-worker" }));
await simAws.backgroundTasksComplete();
